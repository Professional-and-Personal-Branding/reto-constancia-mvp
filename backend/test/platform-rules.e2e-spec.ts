import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ActivityStatus, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

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
  const photo = { url: 'https://example.com/e2e/rules.png', cloudinaryId: 'e2e/rules', type: 'ACTIVITY' };

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

  function activity(date: string, extra: Record<string, unknown> = {}) {
    return { challengeId, date, exerciseType: 'RUNNING', durationMinutes: 30, distanceKm: 5, photos: [photo], ...extra };
  }

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
      .send({ paymentProofUrl: 'https://example.com/e2e/comprobante.pdf', paymentProofCloudinaryId: 'e2e/comprobante' });
    expect(res.status).toBe(200);
    expect(res.body.paymentProofUrl).toBe('https://example.com/e2e/comprobante.pdf');
    expect(res.body.paymentProofUploadedAt).toBeTruthy();
    expect(res.body.paid).toBe(false); // el comprobante no marca el pago: lo confirma el admin
  });

  // ---------------- Actividades ----------------

  it('ACT: sin fotos la actividad se rechaza (400)', async () => {
    const res = await request(http).post('/api/activities').set(auth(token.ana)).send(activity(monday, { photos: [] }));
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body.message)).toMatch(/foto/i);
  });

  it('ACT: una fecha fuera del período se rechaza (400)', async () => {
    const res = await request(http).post('/api/activities').set(auth(token.ana)).send(activity(`${YEAR}-02-10`));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/fuera del período/);
  });

  it('ACT: un día de la semana no habilitado se rechaza (400)', async () => {
    const res = await request(http).post('/api/activities').set(auth(token.ana)).send(activity(sunday));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/día de la semana no es válido/);
  });

  it('ACT: quien no está inscrito no puede registrar (403)', async () => {
    const res = await request(http).post('/api/activities').set(auth(token.outsider)).send(activity(monday));
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
      .send({ ...activity(`${YEAR}-02-05`), challengeId: draftChallengeId });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/no está activo/);
  });

  it('ACT: cada participante solo ve sus propias actividades', async () => {
    expect((await request(http).post('/api/activities').set(auth(token.ana)).send(activity(monday))).status).toBe(201);
    expect((await request(http).post('/api/activities').set(auth(token.bruno)).send(activity(monday))).status).toBe(201);
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
    const created = await request(http).post('/api/activities').set(auth(token.ana)).send(activity(tuesday));
    const del = await request(http).delete(`/api/activities/${created.body.id}`).set(auth(token.ana));
    expect(del.status).toBe(204);
  });

  it('ACT: el participante no puede borrar actividades ajenas (403)', async () => {
    const created = await request(http).post('/api/activities').set(auth(token.bruno)).send(activity(wednesday));
    const del = await request(http).delete(`/api/activities/${created.body.id}`).set(auth(token.ana));
    expect(del.status).toBe(403);
    expect(del.body.message).toMatch(/No puedes eliminar/);
  });

  it('ACT: el participante no puede borrar una actividad ya validada (403); el admin sí', async () => {
    const created = await request(http).post('/api/activities').set(auth(token.ana)).send(activity(thursday));
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

    const award = await request(http)
      .post(`/api/challenges/${challengeId}/awards`)
      .set(auth(token.admin))
      .send({ userIds: [id.bruno], notes: 'Sorteo presencial' });
    expect(award.status).toBe(201);

    const after = await request(http).get(`/api/challenges/${challengeId}/results`).set(auth(token.admin));
    expect(after.body.status).toBe('COMPLETED');
    expect(after.body.winners.map((w: { userId: string }) => w.userId)).toEqual([id.bruno]);
    expect(after.body.awards[0]).toMatchObject({ userId: id.bruno, notes: 'Sorteo presencial' });
    expect(after.body.payout).toMatchObject({ pot: 300, winnersCount: 1, perWinner: 300 });
  });

  it('PART: en un reto cerrado no se inscribe ni se quita a nadie (400)', async () => {
    const add = await request(http).post(`/api/challenges/${challengeId}/participants`).set(auth(token.admin)).send({ userId: id.outsider });
    expect(add.status).toBe(400);
    expect(add.body.message).toMatch(/reto cerrado/);
    const del = await request(http).delete(`/api/challenges/${challengeId}/participants/${id.ana}`).set(auth(token.admin));
    expect(del.status).toBe(400);
  });

  it('ACT: en un reto cerrado no se registran actividades (400)', async () => {
    const res = await request(http).post('/api/activities').set(auth(token.ana)).send(activity(friday));
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
    const res = await request(http).post('/api/upload/sign').set(auth(token.ana)).send({ folder: 'e2e' });
    expect(res.status).toBe(201);
    expect(res.body.uploadUrl).toBeTruthy();
    expect(res.body.signature).toBeTruthy();
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
