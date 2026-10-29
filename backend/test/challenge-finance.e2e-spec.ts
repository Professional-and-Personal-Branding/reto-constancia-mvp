import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ActivityStatus, ExerciseType, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { ownedAsset } from './helpers/assets';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * E2E de finanzas del reto (OpenSpec: challenge-finance).
 * Datos propios (año 2098, usuarios `e2e-fin-*`), limpiados al inicio y al final.
 */
describe('Finanzas del reto: resumen, estados de pago y payout (e2e)', () => {
  let app: INestApplication;
  let http: import('http').Server;
  let prisma: PrismaService;

  const YEAR = 2098;
  const password = 'Secret123';
  const adminEmail = 'e2e-fin-admin@reto.local';
  const participantEmails = [1, 2, 3, 4, 5].map((i) => `e2e-fin-p${i}@reto.local`);

  let adminToken: string;
  let participantToken: string;
  let participant5Token: string;
  let participantIds: string[] = [];
  let challenge: { id: string };
  let freeChallenge: { id: string };

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function login(email: string): Promise<string> {
    const res = await request(http).post('/api/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    return res.body.tokens.accessToken as string;
  }

  async function cleanup() {
    await prisma.challenge.deleteMany({ where: { year: YEAR } });
    await prisma.user.deleteMany({ where: { email: { startsWith: 'e2e-fin-' } } });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
    http = app.getHttpServer();
    prisma = app.get(PrismaService);
    await cleanup();

    const passwordHash = await argon2.hash(password);
    await prisma.user.create({
      data: { email: adminEmail, name: 'E2E Fin Admin', passwordHash, role: UserRole.ADMIN },
    });
    participantIds = [];
    for (const [i, email] of participantEmails.entries()) {
      const u = await prisma.user.create({
        data: { email, name: `E2E Fin P${i + 1}`, passwordHash, role: UserRole.PARTICIPANT },
      });
      participantIds.push(u.id);
    }
    adminToken = await login(adminEmail);
    participantToken = await login(participantEmails[0]);
    participant5Token = await login(participantEmails[4]);
  });

  afterAll(async () => {
    await cleanup();
    await app?.close();
  });

  it('admin crea el reto (cuota 120, presupuesto 600) e inscribe 5 participantes', async () => {
    const res = await request(http)
      .post('/api/challenges')
      .set(auth(adminToken))
      .send({
        name: 'E2E Finanzas',
        month: 1,
        year: YEAR,
        startDate: `${YEAR}-01-01T00:00:00.000Z`,
        endDate: `${YEAR}-01-31T23:59:59.000Z`,
        validDays: [0, 1, 2, 3, 4, 5, 6],
        minHeartRateMinutes: 0,
        feePerParticipant: 120,
        budgetTotal: 600,
        currency: 'BOB',
      });
    expect(res.status).toBe(201);
    challenge = res.body;
    await request(http).post(`/api/challenges/${challenge.id}/activate`).set(auth(adminToken));
    for (const userId of participantIds) {
      const add = await request(http)
        .post(`/api/challenges/${challenge.id}/participants`)
        .set(auth(adminToken))
        .send({ userId });
      expect(add.status).toBe(201);
    }
  });

  it('marcar pagado sin monto registra la cuota; con monto lo respeta', async () => {
    for (const userId of participantIds.slice(0, 3)) {
      const res = await request(http)
        .patch(`/api/challenges/${challenge.id}/participants/${userId}/payment`)
        .set(auth(adminToken))
        .send({ paid: true });
      expect(res.status).toBe(200);
      expect(Number(res.body.amountPaid)).toBe(120);
      expect(res.body.paidAt).toBeTruthy();
    }
    const partial = await request(http)
      .patch(`/api/challenges/${challenge.id}/participants/${participantIds[3]}/payment`)
      .set(auth(adminToken))
      .send({ paid: true, amountPaid: 60 });
    expect(partial.status).toBe(200);
    expect(Number(partial.body.amountPaid)).toBe(60);
  });

  it('GET /challenges/:id/finance: esperado 600, recaudado 420, pendiente 180, presupuesto no cubierto', async () => {
    const res = await request(http)
      .get(`/api/challenges/${challenge.id}/finance`)
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.currency).toBe('BOB');
    expect(res.body.participantsTotal).toBe(5);
    expect(res.body.expectedTotal).toBe(600);
    expect(res.body.collectedTotal).toBe(420);
    expect(res.body.pendingTotal).toBe(180);
    expect(res.body.budgetCovered).toBe(false);
    expect(res.body.budgetDelta).toBe(-180);
    expect(res.body.counts).toEqual({ paid: 3, partial: 1, unpaid: 1 });
    const states = Object.fromEntries(
      (res.body.participants as { userId: string; state: string }[]).map((p) => [p.userId, p.state]),
    );
    expect(states[participantIds[3]]).toBe('partial');
    expect(states[participantIds[4]]).toBe('unpaid');
  });

  it('marcar impago limpia monto y fecha y actualiza el resumen', async () => {
    const res = await request(http)
      .patch(`/api/challenges/${challenge.id}/participants/${participantIds[0]}/payment`)
      .set(auth(adminToken))
      .send({ paid: false });
    expect(res.status).toBe(200);
    expect(res.body.paid).toBe(false);
    expect(res.body.amountPaid).toBeNull();
    expect(res.body.paidAt).toBeNull();

    const fin = await request(http)
      .get(`/api/challenges/${challenge.id}/finance`)
      .set(auth(adminToken));
    expect(fin.body.collectedTotal).toBe(300);
    expect(fin.body.counts.unpaid).toBe(2);
  });

  it('cola de comprobantes: un comprobante entra, registrar el pago lo saca y nunca suma al recaudado', async () => {
    const pause = () => new Promise((resolve) => setTimeout(resolve, 25));
    const finance = async () =>
      (await request(http).get(`/api/challenges/${challenge.id}/finance`).set(auth(adminToken))).body;
    const rowOf = (
      body: { participants: { userId: string; proofToReview: boolean; proofUploadedAt: string | null; state: string }[] },
      userId: string,
    ) => body.participants.find((p) => p.userId === userId)!;
    const uploadProof = async (name: string) => {
      const asset = ownedAsset({
        challengeId: challenge.id,
        userId: participantIds[4],
        purpose: 'payment-proof',
        name,
        ext: 'pdf',
      });
      return request(http)
        .patch(`/api/challenges/${challenge.id}/participants/me/payment-proof`)
        .set(auth(participant5Token))
        .send({ paymentProofUrl: asset.url, paymentProofCloudinaryId: asset.cloudinaryId });
    };
    const pay = (body: Record<string, unknown>) =>
      request(http)
        .patch(`/api/challenges/${challenge.id}/participants/${participantIds[4]}/payment`)
        .set(auth(adminToken))
        .send(body);

    const before = await finance();
    expect(before.proofsToReview).toBe(0);
    expect(rowOf(before, participantIds[4])).toMatchObject({ proofToReview: false, proofUploadedAt: null });

    // El comprobante entra en la cola y no suma a lo recaudado
    expect((await uploadProof('uno')).status).toBe(200);
    const queued = await finance();
    expect(queued.proofsToReview).toBe(1);
    expect(rowOf(queued, participantIds[4]).proofToReview).toBe(true);
    expect(rowOf(queued, participantIds[4]).proofUploadedAt).toBeTruthy();
    expect(queued.collectedTotal).toBe(before.collectedTotal);
    expect(queued.pendingTotal).toBe(before.pendingTotal);
    expect(queued.counts).toEqual(before.counts);

    // Registrar 120 lo saca de la cola
    await pause();
    expect((await pay({ paid: true })).status).toBe(200);
    const paid = await finance();
    expect(paid.proofsToReview).toBe(0);
    expect(rowOf(paid, participantIds[4])).toMatchObject({ proofToReview: false, state: 'paid' });

    // Desmarcar con el comprobante guardado lo devuelve; registrar 60 y subir otro, también
    await pause();
    expect((await pay({ paid: false })).status).toBe(200);
    expect((await finance()).proofsToReview).toBe(1);
    await pause();
    expect((await pay({ paid: true, amountPaid: 60 })).status).toBe(200);
    const partial = await finance();
    expect(partial.proofsToReview).toBe(0);
    expect(rowOf(partial, participantIds[4])).toMatchObject({ proofToReview: false, state: 'partial' });
    await pause();
    expect((await uploadProof('dos')).status).toBe(200);
    const again = await finance();
    expect(again.proofsToReview).toBe(1);
    expect(rowOf(again, participantIds[4])).toMatchObject({ proofToReview: true, state: 'partial' });
    expect(again.collectedTotal).toBe(partial.collectedTotal);

    // Una persona sin permisos de admin no lee la cola
    const denied = await request(http).get(`/api/challenges/${challenge.id}/finance`).set(auth(participantToken));
    expect(denied.status).toBe(403);
  });

  it('el resumen financiero es solo para admin (403) y 404 si el reto no existe', async () => {
    const forbidden = await request(http)
      .get(`/api/challenges/${challenge.id}/finance`)
      .set(auth(participantToken));
    expect(forbidden.status).toBe(403);
    const missing = await request(http)
      .get('/api/challenges/00000000-0000-4000-8000-000000000000/finance')
      .set(auth(adminToken));
    expect(missing.status).toBe(404);
  });

  it('results incluye payout: el pote es lo recaudado para un ganador', async () => {
    await prisma.dailyActivity.create({
      data: {
        challengeId: challenge.id,
        userId: participantIds[1],
        date: new Date(`${YEAR}-01-05T00:00:00.000Z`),
        exerciseType: ExerciseType.RUNNING,
        durationMinutes: 30,
        status: ActivityStatus.VALIDATED,
      },
    });
    const res = await request(http)
      .get(`/api/challenges/${challenge.id}/results`)
      .set(auth(participantToken));
    expect(res.status).toBe(200);
    expect(res.body.winners).toHaveLength(1);
    // El pote no es el presupuesto (600): es lo cobrado hasta ahora
    const finance = await request(http).get(`/api/challenges/${challenge.id}/finance`).set(auth(adminToken));
    const collected = finance.body.collectedTotal;
    expect(collected).toBeGreaterThan(0);
    expect(collected).toBeLessThan(600);
    expect(res.body.payout).toEqual({ pot: collected, winnersCount: 1, perWinner: collected, monetary: true });
  });

  it('un reto sin cuota reporta premio no monetario', async () => {
    const res = await request(http)
      .post('/api/challenges')
      .set(auth(adminToken))
      .send({
        name: 'E2E Sin premio',
        month: 2,
        year: YEAR,
        startDate: `${YEAR}-02-01T00:00:00.000Z`,
        endDate: `${YEAR}-02-28T23:59:59.000Z`,
        feePerParticipant: 0,
      });
    expect(res.status).toBe(201);
    freeChallenge = res.body;
    const results = await request(http)
      .get(`/api/challenges/${freeChallenge.id}/results`)
      .set(auth(adminToken));
    expect(results.body.payout.monetary).toBe(false);
    expect(results.body.payout.perWinner).toBe(0);
  });
});

/**
 * E2E de pagos en lote (OpenSpec: challenge-finance, cambio bulk-payment-marking).
 * Datos propios (año 2089, usuarios `e2e-bulkpay-*`), limpiados al inicio y al final.
 */
describe('Pagos en lote: PATCH /challenges/:id/participants/payments (e2e)', () => {
  let app: INestApplication;
  let http: import('http').Server;
  let prisma: PrismaService;

  const YEAR = 2089;
  const password = 'Secret123';
  const adminEmail = 'e2e-bulkpay-admin@reto.local';
  const partEmail = 'e2e-bulkpay-part@reto.local';

  let adminToken: string;
  let participantToken: string;
  let users: Record<string, string> = {};

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const NAMES = ['ana', 'bea', 'carla', 'diego', 'luis', 'x1', 'x2', 'x3'];
  const BULK = (id: string) => `/api/challenges/${id}/participants/payments`;

  async function cleanup() {
    await prisma.challenge.deleteMany({ where: { year: YEAR } });
    await prisma.user.deleteMany({ where: { email: { startsWith: 'e2e-bulkpay-' } } });
  }

  async function login(email: string): Promise<string> {
    const res = await request(http).post('/api/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    return res.body.tokens.accessToken as string;
  }

  /** Reto activo del mes `month` con la cuota dada e inscritos `enrolled` (nombre -> monto pagado). */
  async function makeChallenge(month: number, fee: number, enrolled: Record<string, number | null | undefined>) {
    const res = await request(http)
      .post('/api/challenges')
      .set(auth(adminToken))
      .send({
        name: `E2E Lote ${month}`,
        month,
        year: YEAR,
        startDate: `${YEAR}-${String(month).padStart(2, '0')}-01T00:00:00.000Z`,
        endDate: `${YEAR}-${String(month).padStart(2, '0')}-27T23:59:59.000Z`,
        validDays: [0, 1, 2, 3, 4, 5, 6],
        minHeartRateMinutes: 0,
        feePerParticipant: fee,
        currency: 'BOB',
      });
    expect(res.status).toBe(201);
    const id = res.body.id as string;
    await request(http).post(`/api/challenges/${id}/activate`).set(auth(adminToken));
    for (const [name, amount] of Object.entries(enrolled)) {
      const add = await request(http).post(`/api/challenges/${id}/participants`).set(auth(adminToken)).send({ userId: users[name] });
      expect(add.status).toBe(201);
      if (amount !== undefined && amount !== null) {
        const pay = await request(http)
          .patch(`/api/challenges/${id}/participants/${users[name]}/payment`)
          .set(auth(adminToken))
          .send({ paid: true, amountPaid: amount });
        expect(pay.status).toBe(200);
      }
    }
    return id;
  }

  async function rows(challengeId: string) {
    const list = await prisma.challengeParticipant.findMany({ where: { challengeId } });
    const byName = new Map(Object.entries(users).map(([n, id]) => [id, n]));
    return Object.fromEntries(
      list.map((r) => [byName.get(r.userId)!, { paid: r.paid, amountPaid: r.amountPaid === null ? null : Number(r.amountPaid), paidAt: r.paidAt }]),
    );
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
    http = app.getHttpServer();
    prisma = app.get(PrismaService);
    await cleanup();

    const passwordHash = await argon2.hash(password);
    await prisma.user.create({ data: { email: adminEmail, name: 'E2E Lote Admin', passwordHash, role: UserRole.ADMIN } });
    await prisma.user.create({ data: { email: partEmail, name: 'E2E Lote Part', passwordHash, role: UserRole.PARTICIPANT } });
    users = {};
    for (const n of NAMES) {
      const u = await prisma.user.create({
        data: { email: `e2e-bulkpay-${n}@reto.local`, name: `E2E Lote ${n}`, passwordHash, role: UserRole.PARTICIPANT },
      });
      users[n] = u.id;
    }
    adminToken = await login(adminEmail);
    participantToken = await login(partEmail);
  });

  afterAll(async () => {
    await cleanup();
    await app?.close();
  });

  let mixed: string;

  it('BULK-PAY: un lote mixto marca solo a quien no tenía pago y reporta el resto aparte', async () => {
    mixed = await makeChallenge(1, 120, { ana: undefined, bea: 120, carla: 60, diego: 150 });
    const ids = ['ana', 'bea', 'carla', 'diego', 'luis'].map((n) => users[n]);
    const res = await request(http).patch(BULK(mixed)).set(auth(adminToken)).send({ userIds: ids, paid: true });
    expect(res.status).toBe(200);
    expect(res.body.feePerParticipant).toBe(120);
    expect(res.body.currency).toBe('BOB');
    expect(res.body.marked.map((r: { userId: string }) => r.userId)).toEqual([users.ana]);
    expect(res.body.marked[0]).toMatchObject({ amountPaid: 120, email: 'e2e-bulkpay-ana@reto.local' });
    expect(res.body.alreadyPaid.map((r: { userId: string }) => r.userId)).toEqual([users.bea]);
    expect(res.body.excluded).toEqual([
      expect.objectContaining({ userId: users.carla, reason: 'PARTIAL', amountPaid: 60 }),
      expect.objectContaining({ userId: users.diego, reason: 'DIFFERENT_AMOUNT', amountPaid: 150 }),
    ]);
    expect(res.body.skipped).toEqual([{ userId: users.luis, reason: 'NOT_ENROLLED', message: 'No está inscrito en este reto' }]);
    const db = await rows(mixed);
    expect(db.ana).toMatchObject({ paid: true, amountPaid: 120 });
    expect(db.ana.paidAt).toBeTruthy();
    expect(db.carla.amountPaid).toBe(60);
    expect(db.diego.amountPaid).toBe(150);
  });

  it('BULK-PAY: repetir el lote no marca a nadie', async () => {
    const before = await rows(mixed);
    const ids = ['ana', 'bea', 'carla', 'diego'].map((n) => users[n]);
    const res = await request(http).patch(BULK(mixed)).set(auth(adminToken)).send({ userIds: ids, paid: true });
    expect(res.status).toBe(200);
    expect(res.body.marked).toEqual([]);
    expect(res.body.alreadyPaid.map((r: { userId: string }) => r.userId).sort()).toEqual([users.ana, users.bea].sort());
    expect(await rows(mixed)).toEqual(before);
  });

  it('BULK-PAY: dos lotes iguales a la vez registran un solo pago por persona', async () => {
    const id = await makeChallenge(2, 120, { x1: undefined, x2: undefined, x3: undefined });
    const ids = [users.x1, users.x2, users.x3];
    const [a, b] = await Promise.all([
      request(http).patch(BULK(id)).set(auth(adminToken)).send({ userIds: ids, paid: true }),
      request(http).patch(BULK(id)).set(auth(adminToken)).send({ userIds: ids, paid: true }),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const markedA: string[] = a.body.marked.map((r: { userId: string }) => r.userId);
    const markedB: string[] = b.body.marked.map((r: { userId: string }) => r.userId);
    expect([...markedA, ...markedB].sort()).toEqual([...ids].sort());
    expect(markedA.filter((u) => markedB.includes(u))).toEqual([]);
    const paidA = a.body.alreadyPaid.map((r: { userId: string }) => r.userId);
    const paidB = b.body.alreadyPaid.map((r: { userId: string }) => r.userId);
    expect([...paidA, ...paidB].sort()).toEqual([...ids].sort());
    const db = await rows(id);
    expect([db.x1.amountPaid, db.x2.amountPaid, db.x3.amountPaid]).toEqual([120, 120, 120]);
  });

  it('BULK-PAY: un reto cerrado rechaza el lote y el pozo no cambia', async () => {
    const id = await makeChallenge(3, 120, { ana: undefined, bea: 120 });
    const potBefore = (await request(http).get(`/api/challenges/${id}/finance`).set(auth(adminToken))).body.collectedTotal;
    await prisma.challenge.update({ where: { id }, data: { status: 'COMPLETED' } });
    const res = await request(http).patch(BULK(id)).set(auth(adminToken)).send({ userIds: [users.ana], paid: true });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('No se puede modificar un reto cerrado');
    expect((await rows(id)).ana).toMatchObject({ paid: false, amountPaid: null });
    const potAfter = (await request(http).get(`/api/challenges/${id}/finance`).set(auth(adminToken))).body.collectedTotal;
    expect(potAfter).toBe(potBefore);
  });

  it('BULK-PAY: un reto sin cuota rechaza el lote', async () => {
    const id = await makeChallenge(4, 0, { ana: undefined });
    const res = await request(http).patch(BULK(id)).set(auth(adminToken)).send({ userIds: [users.ana], paid: true });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Este reto no cobra cuota');
    expect((await rows(id)).ana).toMatchObject({ paid: false, amountPaid: null });
  });

  it('BULK-PAY: lote vacío, de 201 ids, con un id inválido o con paid false responde 400', async () => {
    const send = (body: object) => request(http).patch(BULK(mixed)).set(auth(adminToken)).send(body);
    const many = Array.from({ length: 201 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
    expect((await send({ userIds: [], paid: true })).status).toBe(400);
    expect((await send({ userIds: many, paid: true })).status).toBe(400);
    expect((await send({ userIds: ['no-es-uuid'], paid: true })).status).toBe(400);
    expect((await send({ userIds: [users.luis], paid: false })).status).toBe(400);
    expect((await send({ userIds: [users.luis] })).status).toBe(400);
    expect((await send({ userIds: [users.luis], paid: true, extra: 1 })).status).toBe(400);
  });

  it('BULK-PAY: un participante recibe 403', async () => {
    const res = await request(http).patch(BULK(mixed)).set(auth(participantToken)).send({ userIds: [users.ana], paid: true });
    expect(res.status).toBe(403);
  });
});
