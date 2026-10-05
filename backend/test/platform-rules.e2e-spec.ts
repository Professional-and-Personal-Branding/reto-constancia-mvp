import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ActivityStatus, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ownedAsset } from './helpers/assets';

/**
 * Reglas de la plataforma que no cubrían las otras suites e2e: validaciones de retos,
 * inscripciones, registro de actividades, rechazo, borrado, comprobante de pago,
 * premiación, sesión, endpoints de subida y límite de intentos.
 *
 * Validan los casos del catálogo docs/qa/test-cases.md (columna "Automatización").
 * Datos propios en el año 2094 y usuarios `e2e-rules-*`, limpiados al inicio y al final.
 */
describe('Reglas de la plataforma (e2e)', () => {
  let app: INestApplication;
  let http: import('http').Server;
  let prisma: PrismaService;

  const YEAR = 2094;
  const password = 'Secret123';
  const emails = {
    admin: 'e2e-rules-admin@reto.local',
    ana: 'e2e-rules-ana@reto.local',
    bruno: 'e2e-rules-bruno@reto.local',
    outsider: 'e2e-rules-outsider@reto.local',
  };

  const token: Record<keyof typeof emails, string> = { admin: '', ana: '', bruno: '', outsider: '' };
  const id: Record<keyof typeof emails, string> = { admin: '', ana: '', bruno: '', outsider: '' };
  let refreshTokenAna = '';
  let challengeId = '';
  let draftChallengeId = '';

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  /** Primer día del mes de enero del año de prueba que cae en el día de semana pedido (0 = domingo). */
  function dayOfWeek(weekday: number, from = 1): string {
    for (let d = from; d <= 28; d++) {
      const iso = `${YEAR}-01-${String(d).padStart(2, '0')}`;
      if (new Date(`${iso}T00:00:00.000Z`).getUTCDay() === weekday) return iso;
    }
    throw new Error('sin fecha');
  }
  const monday = dayOfWeek(1);
  const tuesday = dayOfWeek(2);
  const wednesday = dayOfWeek(3);
  const thursday = dayOfWeek(4);
  const friday = dayOfWeek(5);
  const sunday = dayOfWeek(0);

  /** Actividad con evidencia propia del participante (spec upload-guardrails). */
  function activityFor(who: keyof typeof emails, date: string, extra: Record<string, unknown> = {}) {
    const photo = { ...ownedAsset({ challengeId, userId: id[who], name: `rules-${date}` }), type: 'ACTIVITY' };
    return { challengeId, date, exerciseType: 'RUNNING', durationMinutes: 30, distanceKm: 5, photos: [photo], ...extra };
  }
  const proofFor = (who: keyof typeof emails, name: string, target = challengeId) => {
    const asset = ownedAsset({ challengeId: target, userId: id[who], purpose: 'payment-proof', name, ext: 'pdf' });
    return { paymentProofUrl: asset.url, paymentProofCloudinaryId: asset.cloudinaryId };
  };

  async function cleanup() {
    await prisma.challenge.deleteMany({ where: { year: YEAR } });
    await prisma.user.deleteMany({ where: { email: { startsWith: 'e2e-rules-' } } });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }),
    );
    await app.init();
    http = app.getHttpServer();
    prisma = app.get(PrismaService);
    await cleanup();

    const passwordHash = await argon2.hash(password);
    for (const key of Object.keys(emails) as (keyof typeof emails)[]) {
      const user = await prisma.user.create({
        data: {
          email: emails[key],
          name: `E2E Rules ${key}`,
          passwordHash,
          role: key === 'admin' ? UserRole.ADMIN : UserRole.PARTICIPANT,
        },
      });
      id[key] = user.id;
      // Un solo login por usuario: el endpoint admite 5 intentos por minuto
      const res = await request(http).post('/api/auth/login').send({ email: emails[key], password });
      expect(res.status).toBe(200);
      token[key] = res.body.tokens.accessToken;
      if (key === 'ana') refreshTokenAna = res.body.tokens.refreshToken;
    }

    const created = await request(http).post('/api/challenges').set(auth(token.admin)).send({
      name: 'E2E Reglas', month: 1, year: YEAR,
      startDate: `${YEAR}-01-01T00:00:00.000Z`, endDate: `${YEAR}-01-31T23:59:59.000Z`,
      validDays: [1, 2, 3, 4, 5, 6], minHeartRateMinutes: 0, feePerParticipant: 100, budgetTotal: 300,
    });
    expect(created.status).toBe(201);
    challengeId = created.body.id;
    await request(http).post(`/api/challenges/${challengeId}/activate`).set(auth(token.admin));
    for (const who of ['ana', 'bruno'] as const) {
      const enroll = await request(http).post(`/api/challenges/${challengeId}/participants`).set(auth(token.admin)).send({ userId: id[who] });
      expect(enroll.status).toBe(201);
    }
  });

  afterAll(async () => {
    await cleanup();
    await app?.close();
  });

  // ---------------- Privacidad (cambio participant-data-privacy) ----------------

  const PAYMENT_KEYS = ['paid', 'paidAt', 'amountPaid', 'paymentProofUrl', 'paymentProofCloudinaryId', 'paymentProofUploadedAt'];
  const OWN_KEYS = ['amountPaid', 'joinedAt', 'paid', 'paidAt', 'paymentProofUploadedAt', 'paymentProofUrl'];

  it('SEC: un participante no recibe la lista de inscritos y su pago va en me', async () => {
    const list = await request(http).get('/api/challenges/active/list').set(auth(token.ana));
    expect(list.status).toBe(200);
    const mine = list.body.find((c: { id: string }) => c.id === challengeId);
    for (const c of list.body) expect(c).not.toHaveProperty('participants');
    expect(mine.isParticipant).toBe(true);
    expect(Object.keys(mine.me).sort()).toEqual(OWN_KEYS);
    expect(mine.me.paid).toBe(false);

    const detail = await request(http).get(`/api/challenges/${challengeId}`).set(auth(token.ana));
    expect(detail.status).toBe(200);
    expect(detail.body).not.toHaveProperty('participants');
    expect(Object.keys(detail.body.me).sort()).toEqual(OWN_KEYS);

    const active = await request(http).get('/api/challenges/active').set(auth(token.ana));
    expect(active.status).toBe(200);
    expect(active.body).not.toHaveProperty('participants');
    expect(active.body.me).not.toBeUndefined();
    expect(JSON.stringify([list.body, detail.body, active.body])).not.toContain(emails.bruno);
  });

  it('SEC: un participante no inscrito recibe me null', async () => {
    const detail = await request(http).get(`/api/challenges/${challengeId}`).set(auth(token.outsider));
    expect(detail.status).toBe(200);
    expect(detail.body.me).toBeNull();
    expect(detail.body).not.toHaveProperty('participants');
  });

  it('SEC: el admin conserva la lista de inscritos con email y pago, más me', async () => {
    const detail = await request(http).get(`/api/challenges/${challengeId}`).set(auth(token.admin));
    expect(detail.body.me).toBeNull();
    const ana = detail.body.participants.find((p: { userId: string }) => p.userId === id.ana);
    expect(ana.user.email).toBe(emails.ana);
    expect(ana).toHaveProperty('paid', false);
  });

  it('SEC: el ranking no expone email ni pago a un participante; el admin sí los ve', async () => {
    const asAna = await request(http).get(`/api/challenges/${challengeId}/results`).set(auth(token.ana));
    expect(asAna.status).toBe(200);
    for (const list of [asAna.body.ranking, asAna.body.tiedAtTop, asAna.body.winners, asAna.body.awards]) {
      for (const row of list) {
        expect(row).not.toHaveProperty('email');
        for (const key of PAYMENT_KEYS) expect(row).not.toHaveProperty(key);
      }
    }
    expect(asAna.body.ranking.map((r: { userId: string }) => r.userId)).toContain(id.bruno);
    expect(asAna.body.payout).toBeDefined();

    const asAdmin = await request(http).get(`/api/challenges/${challengeId}/results`).set(auth(token.admin));
    expect(Object.keys(asAdmin.body).sort()).toEqual(Object.keys(asAna.body).sort());
    expect(asAdmin.body.payout).toEqual(asAna.body.payout);
    const bruno = asAdmin.body.ranking.find((r: { userId: string }) => r.userId === id.bruno);
    expect(bruno).toMatchObject({ email: emails.bruno, paid: false });
  });

  it('SEC: el listado de inscritos es solo para admin (403 al participante)', async () => {
    const asAna = await request(http).get(`/api/challenges/${challengeId}/participants`).set(auth(token.ana));
    expect(asAna.status).toBe(403);
    const asAdmin = await request(http).get(`/api/challenges/${challengeId}/participants`).set(auth(token.admin));
    expect(asAdmin.status).toBe(200);
    expect(asAdmin.body.map((p: { user: { email: string } }) => p.user.email)).toContain(emails.ana);
  });

  it('SEC: el detalle de una actividad es solo para su dueño o un admin', async () => {
    const created = await request(http).post('/api/activities').set(auth(token.bruno)).send(activityFor('bruno', monday));
    expect(created.status).toBe(201);
    const activityId = created.body.id;

    const asAna = await request(http).get(`/api/activities/${activityId}`).set(auth(token.ana));
    expect(asAna.status).toBe(403);
    expect(asAna.body.message).toBe('No puedes ver esta actividad');
    expect(JSON.stringify(asAna.body)).not.toContain(emails.bruno);

    expect((await request(http).get(`/api/activities/${activityId}`).set(auth(token.bruno))).status).toBe(200);
    expect((await request(http).get(`/api/activities/${activityId}`).set(auth(token.admin))).status).toBe(200);
    const missing = await request(http).get('/api/activities/00000000-0000-0000-0000-000000000000').set(auth(token.ana));
    expect(missing.status).toBe(404);

    // Deja el estado como estaba para el resto de la suite
    await request(http).delete(`/api/activities/${activityId}`).set(auth(token.admin));
  });

  // ---------------- Subidas: firma y evidencia propia (cambio upload-guardrails) ----------------

  it('UP: la firma va al reto, al usuario y al propósito, con formatos firmados', async () => {
    const res = await request(http).post('/api/upload/sign').set(auth(token.ana)).send({ challengeId, purpose: 'activity' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      folder: `reto-constancia/${challengeId}/${id.ana}/activity`,
      allowedFormats: 'heic,jpg,png,webp',
      maxBytes: 10 * 1024 * 1024,
      local: true,
    });
    const proof = await request(http).post('/api/upload/sign').set(auth(token.ana)).send({ challengeId, purpose: 'payment-proof' });
    expect(proof.body.allowedFormats).toBe('heic,jpg,pdf,png,webp');
  });

  it('UP: la carpeta y el tipo de recurso no los elige el cliente (400)', async () => {
    for (const body of [{ challengeId, purpose: 'activity', folder: 'otra' }, { challengeId, purpose: 'activity', resourceType: 'raw' }, { folder: 'e2e' }, { challengeId, purpose: 'video' }, { challengeId: 'no-uuid', purpose: 'activity' }]) {
      expect((await request(http).post('/api/upload/sign').set(auth(token.ana)).send(body)).status).toBe(400);
    }
  });

  it('UP: solo firma un participante del reto (403), también para el admin', async () => {
    for (const who of ['outsider', 'admin'] as const) {
      const res = await request(http).post('/api/upload/sign').set(auth(token[who])).send({ challengeId, purpose: 'activity' });
      expect(res.status).toBe(403);
      expect(res.body.message).toBe('No participas en este reto');
    }
    const missing = await request(http).post('/api/upload/sign').set(auth(token.ana)).send({ challengeId: '00000000-0000-4000-8000-000000000000', purpose: 'activity' });
    expect(missing.status).toBe(404);
  });

  it('UP: el simulador local guarda en la carpeta propia y aplica formatos y dueño', async () => {
    const folder = `reto-constancia/${challengeId}/${id.ana}/activity`;
    const ok = await request(http).post('/api/upload/local').set(auth(token.ana)).field('folder', folder).attach('file', Buffer.from('x'), 'foto.jpeg');
    expect(ok.status).toBe(201);
    expect(ok.body.public_id.startsWith(`${folder}/`)).toBe(true);
    expect(ok.body.secure_url.endsWith('.jpg')).toBe(true);

    const gif = await request(http).post('/api/upload/local').set(auth(token.ana)).field('folder', folder).attach('file', Buffer.from('x'), 'x.gif');
    expect(gif.status).toBe(400);
    expect(gif.body.message).toMatch(/Formato no permitido/);
    const foreign = await request(http).post('/api/upload/local').set(auth(token.bruno)).field('folder', folder).attach('file', Buffer.from('x'), 'x.png');
    expect(foreign.status).toBe(403);
    const legacy = await request(http).post('/api/upload/local').set(auth(token.ana)).field('folder', 'reto-constancia/2094-01').attach('file', Buffer.from('x'), 'x.png');
    expect(legacy.status).toBe(400);

    // Lo subido por el simulador sirve como evidencia propia
    const created = await request(http).post('/api/activities').set(auth(token.ana)).send({
      ...activityFor('ana', tuesday),
      photos: [{ url: ok.body.secure_url, cloudinaryId: ok.body.public_id, type: 'ACTIVITY' }],
    });
    expect(created.status).toBe(201);
    await request(http).delete(`/api/activities/${created.body.id}`).set(auth(token.admin));
  });

  it('UP: una actividad con foto externa o ajena se rechaza (400) y no se crea', async () => {
    const external = await request(http).post('/api/activities').set(auth(token.ana)).send(
      activityFor('ana', monday, { photos: [{ url: 'https://example.com/e2e/rules.png', cloudinaryId: 'e2e/rules', type: 'ACTIVITY' }] }),
    );
    expect(external.status).toBe(400);
    expect(external.body.message).toBe('La foto debe subirse desde la plataforma');
    const brunoPhoto = activityFor('bruno', monday).photos;
    const foreign = await request(http).post('/api/activities').set(auth(token.ana)).send(activityFor('ana', monday, { photos: brunoPhoto }));
    expect(foreign.status).toBe(400);
    const mine = await request(http).get(`/api/activities/me?challengeId=${challengeId}`).set(auth(token.ana));
    expect(mine.body).toHaveLength(0);
  });

  it('UP: el comprobante ajeno se rechaza (400) y el admin no puede adjuntar comprobantes (400)', async () => {
    const foreign = await request(http).patch(`/api/challenges/${challengeId}/participants/me/payment-proof`).set(auth(token.ana)).send(proofFor('bruno', 'ajeno'));
    expect(foreign.status).toBe(400);
    expect(foreign.body.message).toBe('El comprobante debe subirse desde la plataforma');
    const outsider = await request(http).patch(`/api/challenges/${challengeId}/participants/me/payment-proof`).set(auth(token.outsider)).send(proofFor('outsider', 'x'));
    expect(outsider.status).toBe(403);

    const admin = await request(http)
      .patch(`/api/challenges/${challengeId}/participants/${id.bruno}/payment`)
      .set(auth(token.admin))
      .send({ paid: true, ...proofFor('bruno', 'admin') });
    expect(admin.status).toBe(400);
    const row = await prisma.challengeParticipant.findUnique({ where: { challengeId_userId: { challengeId, userId: id.bruno } } });
    expect(row).toMatchObject({ paid: false, paymentProofCloudinaryId: null });
  });

  // ---------------- Bloqueo del reto (closed-challenge-freeze) ----------------

  it('FREEZE: si el reto está bloqueado por un cierre más de 5 s, validar responde 409 y no cambia nada', async () => {
    const created = await request(http).post('/api/challenges').set(auth(token.admin)).send({
      name: 'E2E Bloqueo', month: 6, year: YEAR,
      startDate: `${YEAR}-06-01T00:00:00.000Z`, endDate: `${YEAR}-06-28T23:59:59.000Z`,
      validDays: [0, 1, 2, 3, 4, 5, 6], minHeartRateMinutes: 0,
    });
    const lockedId = created.body.id as string;
    await request(http).post(`/api/challenges/${lockedId}/activate`).set(auth(token.admin));
    await request(http).post(`/api/challenges/${lockedId}/participants`).set(auth(token.admin)).send({ userId: id.ana });
    const photo = { ...ownedAsset({ challengeId: lockedId, userId: id.ana, name: 'bloqueo' }), type: 'ACTIVITY' };
    const act = await request(http).post('/api/activities').set(auth(token.ana)).send({
      challengeId: lockedId, date: `${YEAR}-06-03`, exerciseType: 'RUNNING', durationMinutes: 30, photos: [photo],
    });
    expect(act.status).toBe(201);

    // Otra transacción retiene el lock exclusivo, como lo haría un cierre lento
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let locked!: () => void;
    const isLocked = new Promise<void>((resolve) => (locked = resolve));
    const holder = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Challenge" WHERE id = ${lockedId} FOR UPDATE`;
        locked();
        await held;
      },
      { maxWait: 5_000, timeout: 30_000 },
    );
    await isLocked;
    try {
      const res = await request(http).post(`/api/activities/${act.body.id}/validate`).set(auth(token.admin));
      expect(res.status).toBe(409);
      expect(res.body.message).toBe('El reto se está cerrando; vuelve a intentarlo en unos segundos');
    } finally {
      release();
      await holder;
    }
    const after = await prisma.dailyActivity.findUnique({ where: { id: act.body.id } });
    expect(after?.status).toBe(ActivityStatus.PENDING);
  }, 30_000);

  // ---------------- Retos ----------------

  it('CHAL: no permite dos retos para el mismo mes y año (409)', async () => {
    const res = await request(http).post('/api/challenges').set(auth(token.admin)).send({
      name: 'Duplicado', month: 1, year: YEAR,
      startDate: `${YEAR}-01-01T00:00:00.000Z`, endDate: `${YEAR}-01-31T23:59:59.000Z`,
    });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/Ya existe un reto/);
  });

  it('CHAL: rechaza un período con inicio igual o posterior al fin (400)', async () => {
    const res = await request(http).post('/api/challenges').set(auth(token.admin)).send({
      name: 'Fechas al revés', month: 3, year: YEAR,
      startDate: `${YEAR}-03-31T00:00:00.000Z`, endDate: `${YEAR}-03-01T00:00:00.000Z`,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/startDate debe ser menor que endDate/);
  });

  it('CHAL: PATCH cambia las reglas de un reto existente', async () => {
    const res = await request(http).patch(`/api/challenges/${challengeId}`).set(auth(token.admin)).send({ minHeartRateMinutes: 15, maxWinners: 3 });
    expect(res.status).toBe(200);
    const read = await request(http).get(`/api/challenges/${challengeId}`).set(auth(token.admin));
    expect(read.body).toMatchObject({ minHeartRateMinutes: 15, maxWinners: 3 });
    await request(http).patch(`/api/challenges/${challengeId}`).set(auth(token.admin)).send({ minHeartRateMinutes: 0, maxWinners: 2 });
  });

  it('CHAL: editar solo la fecha de fin antes del inicio se rechaza (400) y no cambia el reto', async () => {
    const before = await request(http).get(`/api/challenges/${challengeId}`).set(auth(token.admin));
    const res = await request(http)
      .patch(`/api/challenges/${challengeId}`)
      .set(auth(token.admin))
      .send({ endDate: `${YEAR - 1}-12-15T00:00:00.000Z` });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/startDate debe ser menor que endDate/);
    const after = await request(http).get(`/api/challenges/${challengeId}`).set(auth(token.admin));
    expect(after.body.endDate).toBe(before.body.endDate);
  });

  it('FIN: el presupuesto automático sigue a los inscritos y a la cuota; uno manual se mantiene', async () => {
    const finance = () => request(http).get(`/api/challenges/${challengeId}/finance`).set(auth(token.admin));
    const patchChallenge = (body: object) => request(http).patch(`/api/challenges/${challengeId}`).set(auth(token.admin)).send(body);

    expect((await finance()).body).toMatchObject({ budgetTotal: 300, budgetMode: 'manual' });

    // null lo vuelve automático: cuota (100) × inscritos (2)
    expect((await patchChallenge({ budgetTotal: null })).status).toBe(200);
    expect((await finance()).body).toMatchObject({ budgetTotal: 200, budgetMode: 'auto' });

    // Sigue a los inscritos y a la cuota
    await request(http).post(`/api/challenges/${challengeId}/participants`).set(auth(token.admin)).send({ userId: id.outsider });
    expect((await finance()).body.budgetTotal).toBe(300);
    await patchChallenge({ feePerParticipant: 150 });
    expect((await finance()).body.budgetTotal).toBe(450);

    // Un monto manual no cambia solo
    await patchChallenge({ budgetTotal: 800 });
    await request(http).delete(`/api/challenges/${challengeId}/participants/${id.outsider}`).set(auth(token.admin));
    expect((await finance()).body).toMatchObject({ budgetTotal: 800, budgetMode: 'manual' });

    // Deja el reto como estaba para las pruebas siguientes
    await patchChallenge({ feePerParticipant: 100, budgetTotal: 300 });
    expect((await finance()).body).toMatchObject({ budgetTotal: 300, budgetMode: 'manual', participantsTotal: 2 });
  });

  // ---------------- Participantes ----------------

  it('PART: inscribir dos veces a la misma persona devuelve 409', async () => {
    const res = await request(http).post(`/api/challenges/${challengeId}/participants`).set(auth(token.admin)).send({ userId: id.ana });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/ya participa/);
  });

  it('PART: quitar a un participante lo saca de la lista (204)', async () => {
    await request(http).post(`/api/challenges/${challengeId}/participants`).set(auth(token.admin)).send({ userId: id.outsider });
    const del = await request(http).delete(`/api/challenges/${challengeId}/participants/${id.outsider}`).set(auth(token.admin));
    expect(del.status).toBe(204);
    const list = await request(http).get(`/api/challenges/${challengeId}/participants`).set(auth(token.admin));
    expect((list.body as { userId: string }[]).some((p) => p.userId === id.outsider)).toBe(false);
  });

  it('PART: el participante sube su comprobante de pago', async () => {
    const res = await request(http)
      .patch(`/api/challenges/${challengeId}/participants/me/payment-proof`)
      .set(auth(token.ana))
      .send(proofFor('ana', 'comprobante'));
    expect(res.status).toBe(200);
    expect(res.body.paymentProofUrl).toBe(proofFor('ana', 'comprobante').paymentProofUrl);
    expect(res.body.paymentProofUploadedAt).toBeTruthy();
    expect(res.body.paid).toBe(false); // el comprobante no marca el pago: lo confirma el admin
  });

  // ---------------- Actividades ----------------

  it('ACT: sin fotos la actividad se rechaza (400)', async () => {
    const res = await request(http).post('/api/activities').set(auth(token.ana)).send(activityFor('ana', monday, { photos: [] }));
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body.message)).toMatch(/foto/i);
  });

  it('ACT: una fecha fuera del período se rechaza (400)', async () => {
    const res = await request(http).post('/api/activities').set(auth(token.ana)).send(activityFor('ana', `${YEAR}-02-10`));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/fuera del período/);
  });

  it('ACT: un día de la semana no habilitado se rechaza (400)', async () => {
    const res = await request(http).post('/api/activities').set(auth(token.ana)).send(activityFor('ana', sunday));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/día de la semana no es válido/);
  });

  it('ACT: quien no está inscrito no puede registrar (403)', async () => {
    const res = await request(http).post('/api/activities').set(auth(token.outsider)).send(activityFor('outsider', monday));
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/No participas/);
  });

  it('ACT: en un reto que no está activo no se registra (400)', async () => {
    const draft = await request(http).post('/api/challenges').set(auth(token.admin)).send({
      name: 'E2E Reglas borrador', month: 2, year: YEAR,
      startDate: `${YEAR}-02-01T00:00:00.000Z`, endDate: `${YEAR}-02-28T23:59:59.000Z`,
    });
    draftChallengeId = draft.body.id;
    await request(http).post(`/api/challenges/${draftChallengeId}/participants`).set(auth(token.admin)).send({ userId: id.ana });
    const res = await request(http)
      .post('/api/activities')
      .set(auth(token.ana))
      .send({ ...activityFor('ana', `${YEAR}-02-05`), challengeId: draftChallengeId });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/no está activo/);
  });

  it('ACT: cada participante solo ve sus propias actividades', async () => {
    expect((await request(http).post('/api/activities').set(auth(token.ana)).send(activityFor('ana', monday))).status).toBe(201);
    expect((await request(http).post('/api/activities').set(auth(token.bruno)).send(activityFor('bruno', monday))).status).toBe(201);
    const mine = await request(http).get(`/api/activities/me?challengeId=${challengeId}`).set(auth(token.ana));
    expect(mine.status).toBe(200);
    expect(mine.body.length).toBeGreaterThan(0);
    expect((mine.body as { userId: string }[]).every((a) => a.userId === id.ana)).toBe(true);
  });

  it('RBAC: el participante no lista todas las actividades ni las pendientes (403)', async () => {
    expect((await request(http).get('/api/activities').set(auth(token.ana))).status).toBe(403);
    expect((await request(http).get('/api/activities/pending').set(auth(token.ana))).status).toBe(403);
  });

  // ---------------- Validación ----------------

  it('VAL: rechazar exige un motivo de al menos 3 caracteres (400)', async () => {
    const bruno = await request(http).get(`/api/activities/me?challengeId=${challengeId}`).set(auth(token.bruno));
    const res = await request(http).post(`/api/activities/${bruno.body[0].id}/reject`).set(auth(token.admin)).send({ reason: 'no' });
    expect(res.status).toBe(400);
    const after = await request(http).get(`/api/activities/me?challengeId=${challengeId}`).set(auth(token.bruno));
    expect(after.body.find((a: { id: string }) => a.id === bruno.body[0].id).status).toBe('PENDING');
  });

  it('VAL: el rechazo guarda el motivo y el participante lo ve', async () => {
    const bruno = await request(http).get(`/api/activities/me?challengeId=${challengeId}`).set(auth(token.bruno));
    const res = await request(http)
      .post(`/api/activities/${bruno.body[0].id}/reject`)
      .set(auth(token.admin))
      .send({ reason: 'La foto no muestra la actividad' });
    expect([200, 201]).toContain(res.status);
    expect(res.body.status).toBe(ActivityStatus.REJECTED);
    const seen = await request(http).get(`/api/activities/me?challengeId=${challengeId}`).set(auth(token.bruno));
    expect(seen.body[0]).toMatchObject({ status: 'REJECTED', rejectionReason: 'La foto no muestra la actividad' });
  });

  // ---------------- Borrado ----------------

  it('ACT: el participante borra su actividad pendiente (204)', async () => {
    const created = await request(http).post('/api/activities').set(auth(token.ana)).send(activityFor('ana', tuesday));
    const del = await request(http).delete(`/api/activities/${created.body.id}`).set(auth(token.ana));
    expect(del.status).toBe(204);
  });

  it('ACT: el participante no puede borrar actividades ajenas (403)', async () => {
    const created = await request(http).post('/api/activities').set(auth(token.bruno)).send(activityFor('bruno', wednesday));
    const del = await request(http).delete(`/api/activities/${created.body.id}`).set(auth(token.ana));
    expect(del.status).toBe(403);
    expect(del.body.message).toMatch(/No puedes eliminar/);
  });

  it('ACT: el participante no puede borrar una actividad ya validada (403); el admin sí', async () => {
    const created = await request(http).post('/api/activities').set(auth(token.ana)).send(activityFor('ana', thursday));
    await request(http).post(`/api/activities/${created.body.id}/validate`).set(auth(token.admin));
    const own = await request(http).delete(`/api/activities/${created.body.id}`).set(auth(token.ana));
    expect(own.status).toBe(403);
    expect(own.body.message).toMatch(/Solo se pueden eliminar actividades pendientes/);
    const byAdmin = await request(http).delete(`/api/activities/${created.body.id}`).set(auth(token.admin));
    expect(byAdmin.status).toBe(204);
  });

  // ---------------- Premiación ----------------

  it('RES: no se puede premiar a quien no participa (400)', async () => {
    const res = await request(http).post(`/api/challenges/${challengeId}/awards`).set(auth(token.admin)).send({ userIds: [id.outsider] });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Solo se puede premiar a participantes/);
  });

  it('RES: la premiación manual prevalece, reparte el premio y cierra el reto', async () => {
    // Ana tiene un día validado y Bruno ninguno: el cálculo automático daría ganadora a Ana
    const ana = await request(http).get(`/api/activities/me?challengeId=${challengeId}`).set(auth(token.ana));
    const pending = (ana.body as { id: string; status: string }[]).find((a) => a.status === 'PENDING');
    await request(http).post(`/api/activities/${pending!.id}/validate`).set(auth(token.admin));

    const before = await request(http).get(`/api/challenges/${challengeId}/results`).set(auth(token.admin));
    expect(before.body.winners.map((w: { userId: string }) => w.userId)).toEqual([id.ana]);

    // Bruno pagó su cuota completa y Ana la mitad: lo recaudado es 150
    await request(http).patch(`/api/challenges/${challengeId}/participants/${id.bruno}/payment`).set(auth(token.admin)).send({ paid: true });
    await request(http).patch(`/api/challenges/${challengeId}/participants/${id.ana}/payment`).set(auth(token.admin)).send({ paid: true, amountPaid: 50 });

    const award = await request(http)
      .post(`/api/challenges/${challengeId}/awards`)
      .set(auth(token.admin))
      .send({ userIds: [id.bruno], notes: 'Sorteo presencial' });
    expect(award.status).toBe(201);

    const after = await request(http).get(`/api/challenges/${challengeId}/results`).set(auth(token.admin));
    expect(after.body.status).toBe('COMPLETED');
    expect(after.body.winners.map((w: { userId: string }) => w.userId)).toEqual([id.bruno]);
    expect(after.body.awards[0]).toMatchObject({ userId: id.bruno, notes: 'Sorteo presencial' });
    // El pote es lo recaudado (150), no el presupuesto de 300
    expect(after.body.payout).toMatchObject({ pot: 150, winnersCount: 1, perWinner: 150 });
  });

  it('PART: en un reto cerrado no se inscribe ni se quita a nadie (400)', async () => {
    const add = await request(http).post(`/api/challenges/${challengeId}/participants`).set(auth(token.admin)).send({ userId: id.outsider });
    expect(add.status).toBe(400);
    expect(add.body.message).toMatch(/reto cerrado/);
    const del = await request(http).delete(`/api/challenges/${challengeId}/participants/${id.ana}`).set(auth(token.admin));
    expect(del.status).toBe(400);
  });

  it('ACT: en un reto cerrado no se registran actividades (400)', async () => {
    const res = await request(http).post('/api/activities').set(auth(token.ana)).send(activityFor('ana', friday));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/no está activo/);
  });

  it('CHAL: un reto cerrado no admite cambios de reglas (400) y conserva su resultado', async () => {
    const before = await request(http).get(`/api/challenges/${challengeId}/results`).set(auth(token.admin));
    const res = await request(http).patch(`/api/challenges/${challengeId}`).set(auth(token.admin)).send({ pointsPerKm: 5, maxWinners: 3 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/No se puede modificar un reto cerrado/);
    const read = await request(http).get(`/api/challenges/${challengeId}`).set(auth(token.admin));
    expect(Number(read.body.pointsPerKm)).toBe(0);
    const after = await request(http).get(`/api/challenges/${challengeId}/results`).set(auth(token.admin));
    expect(after.body.winners).toEqual(before.body.winners);
  });

  it('CHAL: un reto cerrado no vuelve a borrador (400) y cerrarlo de nuevo no cambia nada', async () => {
    const draft = await request(http).patch(`/api/challenges/${challengeId}`).set(auth(token.admin)).send({ status: 'DRAFT' });
    expect(draft.status).toBe(400);
    const close = await request(http).post(`/api/challenges/${challengeId}/close`).set(auth(token.admin));
    expect(close.status).toBe(201);
    expect(close.body.status).toBe('COMPLETED');
  });

  it('FIN: un reto cerrado no admite pagos ni comprobantes y su pote no cambia', async () => {
    const before = await request(http).get(`/api/challenges/${challengeId}/results`).set(auth(token.admin));
    const unpay = await request(http).patch(`/api/challenges/${challengeId}/participants/${id.bruno}/payment`).set(auth(token.admin)).send({ paid: false });
    expect(unpay.status).toBe(400);
    expect(unpay.body.message).toMatch(/No se puede modificar un reto cerrado/);
    const pay = await request(http).patch(`/api/challenges/${challengeId}/participants/${id.ana}/payment`).set(auth(token.admin)).send({ paid: true, amountPaid: 100 });
    expect(pay.status).toBe(400);
    const proof = await request(http)
      .patch(`/api/challenges/${challengeId}/participants/me/payment-proof`)
      .set(auth(token.ana))
      .send(proofFor('ana', 'tarde'));
    expect(proof.status).toBe(400);
    const sign = await request(http).post('/api/upload/sign').set(auth(token.ana)).send({ challengeId, purpose: 'payment-proof' });
    expect(sign.status).toBe(400);
    expect(sign.body.message).toBe('No se puede modificar un reto cerrado');
    const after = await request(http).get(`/api/challenges/${challengeId}/results`).set(auth(token.admin));
    expect(after.body.payout.pot).toBe(before.body.payout.pot);
  });

  it('FREEZE: en un reto cerrado nadie valida, rechaza ni borra actividades (400)', async () => {
    const acts = await prisma.dailyActivity.findMany({ where: { challengeId }, orderBy: { date: 'asc' } });
    const pending = acts.find((a) => a.status === ActivityStatus.PENDING);
    const validated = acts.find((a) => a.status === ActivityStatus.VALIDATED);
    expect(pending && validated).toBeTruthy();
    const before = await request(http).get(`/api/challenges/${challengeId}/results`).set(auth(token.admin));
    const msg = 'El reto está cerrado; sus actividades son definitivas';

    for (const res of [
      await request(http).post(`/api/activities/${pending!.id}/validate`).set(auth(token.admin)),
      await request(http).post(`/api/activities/${validated!.id}/validate`).set(auth(token.admin)),
      await request(http).post(`/api/activities/${validated!.id}/reject`).set(auth(token.admin)).send({ reason: 'tarde' }),
      await request(http).delete(`/api/activities/${pending!.id}`).set(auth(token.admin)),
    ]) {
      expect(res.status).toBe(400);
      expect(res.body.message).toBe(msg);
    }
    // El dueño y un extraño también reciben 400 (el reto cerrado va antes que la propiedad)
    const owner = Object.entries(id).find(([, uid]) => uid === pending!.userId)![0] as keyof typeof token;
    expect((await request(http).delete(`/api/activities/${pending!.id}`).set(auth(token[owner]))).status).toBe(400);
    expect((await request(http).delete(`/api/activities/${pending!.id}`).set(auth(token.outsider))).status).toBe(400);

    const after = await prisma.dailyActivity.findMany({ where: { challengeId }, orderBy: { date: 'asc' } });
    expect(after.map((a) => [a.id, a.status])).toEqual(acts.map((a) => [a.id, a.status]));
    const results = await request(http).get(`/api/challenges/${challengeId}/results`).set(auth(token.admin));
    expect(results.body.ranking).toEqual(before.body.ranking);
  });

  it('FREEZE: la importación no escribe en un reto cerrado ni crea cuentas', async () => {
    const csv = [
      'email,name,challengeMonth,challengeYear,date,exerciseType,durationMinutes',
      `e2e-rules-tardio@reto.local,Tardío,1,${YEAR},${monday},RUNNING,30`,
    ].join('\n');
    const preview = await request(http).post('/api/import/activities/preview').set(auth(token.admin)).attach('file', Buffer.from(csv, 'utf8'), 'tarde.csv');
    expect(preview.body.summary.invalid).toBe(1);
    expect(preview.body.rows[0].errors).toContain(`El reto 1/${YEAR} está cerrado; no se pueden importar actividades`);

    const commit = await request(http).post('/api/import/activities/commit').set(auth(token.admin)).attach('file', Buffer.from(csv, 'utf8'), 'tarde.csv');
    expect(commit.status).toBe(201);
    expect(commit.body).toMatchObject({ created: 0, usersCreated: 0, participantsCreated: 0 });
    expect(commit.body.errors[0].message).toBe(`El reto 1/${YEAR} está cerrado; no se pueden importar actividades`);
    expect(await prisma.user.findUnique({ where: { email: 'e2e-rules-tardio@reto.local' } })).toBeNull();
  });

  it('RES: la premiación de un reto cerrado se puede registrar después del cierre', async () => {
    const award = await request(http)
      .post(`/api/challenges/${challengeId}/awards`)
      .set(auth(token.admin))
      .send({ userIds: [id.ana], notes: 'Sorteo presencial repetido ante el grupo' });
    expect(award.status).toBe(201);
    const results = await request(http).get(`/api/challenges/${challengeId}/results`).set(auth(token.admin));
    expect(results.body.status).toBe('COMPLETED');
    expect(results.body.winners.map((w: { userId: string }) => w.userId)).toEqual([id.ana]);
  });

  // ---------------- Sesión ----------------

  it('AUTH: el registro rechaza contraseñas sin número (400)', async () => {
    // Sin número, demasiado corta y sin letra: ninguna crea la cuenta
    const cases: Array<[string, RegExp]> = [
      ['soloLetras', /al menos una letra y un número/],
      ['corta1', /8 characters/],
      ['12345678', /al menos una letra y un número/],
    ];
    for (const [password, message] of cases) {
      const res = await request(http).post('/api/auth/register').send({ name: 'Débil', email: 'e2e-rules-weak@reto.local', password });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body.message)).toMatch(message);
    }
    const login = await request(http).post('/api/auth/login').send({ email: 'e2e-rules-weak@reto.local', password: 'soloLetras' });
    expect(login.status).toBe(401);
  });

  it('AUTH: el registro rechaza un email ya usado (409)', async () => {
    const res = await request(http).post('/api/auth/register').send({ name: 'Repetida', email: emails.ana, password: 'Secret123' });
    expect(res.status).toBe(409);
  });

  it('AUTH: el refresh token emite un access token nuevo que funciona', async () => {
    const res = await request(http).post('/api/auth/refresh').send({ refreshToken: refreshTokenAna });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    const me = await request(http).get('/api/auth/me').set(auth(res.body.accessToken));
    expect(me.status).toBe(200);
    expect(me.body.email).toBe(emails.ana);
  });

  it('AUTH: un refresh token inválido se rechaza (401)', async () => {
    const res = await request(http).post('/api/auth/refresh').send({ refreshToken: 'no-es-un-token' });
    expect(res.status).toBe(401);
  });

  // ---------------- Subidas ----------------

  it('UP: firmar una subida exige sesión (401) y con sesión devuelve la firma', async () => {
    expect((await request(http).post('/api/upload/sign').send({})).status).toBe(401);
    // A esta altura el reto principal está cerrado: el comprobante se firma en el borrador
    const res = await request(http).post('/api/upload/sign').set(auth(token.ana)).send({ challengeId: draftChallengeId, purpose: 'payment-proof' });
    expect(res.status).toBe(201);
    expect(res.body.uploadUrl).toBeTruthy();
    expect(res.body.signature).toBeTruthy();
    expect(res.body.folder).toBe(`reto-constancia/${draftChallengeId}/${id.ana}/payment-proof`);
  });

  it('UP: el simulador local de subidas exige sesión (401)', async () => {
    const res = await request(http).post('/api/upload/local').attach('file', Buffer.from('x'), 'x.png');
    expect(res.status).toBe(401);
  });

  // ---------------- Importación ----------------

  it('IMP: un CSV en UTF-8 conserva acentos y eñes en la vista previa', async () => {
    const csv = [
      'email,name,challengeMonth,challengeYear,date,exerciseType,durationMinutes,notes',
      `e2e-rules-acentos@reto.local,José Núñez Peña,1,${YEAR},${monday},RUNNING,30,Olvidé el reloj`,
    ].join('\n');
    const res = await request(http)
      .post('/api/import/activities/preview')
      .set(auth(token.admin))
      .attach('file', Buffer.from(csv, 'utf8'), 'acentos.csv');
    expect(res.status).toBe(201);
    expect(res.body.rows[0].data).toMatchObject({ name: 'José Núñez Peña', notes: 'Olvidé el reloj' });
  });

  // ---------------- Límite de intentos (al final: agota el cupo del minuto) ----------------

  it('AUTH: tras 5 intentos de login en un minuto responde 429', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      const res = await request(http).post('/api/auth/login').send({ email: emails.ana, password: 'incorrecta1' });
      statuses.push(res.status);
    }
    // Dentro del cupo responde 401; al superarlo, 429 en todos los intentos siguientes
    const first429 = statuses.indexOf(429);
    expect(first429).toBeGreaterThanOrEqual(0);
    expect(statuses.slice(0, first429).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(first429).every((s) => s === 429)).toBe(true);
  });
});
