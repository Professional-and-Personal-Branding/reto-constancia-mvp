import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ActivityStatus, ChallengeStatus, ExerciseType, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import { randomUUID } from 'crypto';

import { AppModule } from '../src/app.module';
import { ChallengesService } from '../src/challenges/challenges.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * E2E de inscripción en bloque (OpenSpec: monthly-challenge-renewal, challenge-enrollment).
 * Datos propios (año 2092, usuarios `e2e-ren-*`), limpiados al inicio y al final.
 * La renovación (bloque `RENEW:`) está más abajo.
 */
describe('BULK: inscripción en bloque (e2e)', () => {
  let app: INestApplication;
  let http: import('http').Server;
  let prisma: PrismaService;

  const YEAR = 2092;
  const password = 'Secret123';
  const adminEmail = 'e2e-ren-admin@reto.local';
  const names = ['ana', 'bea', 'carla', 'diana', 'luis'];

  let adminToken: string;
  let participantToken: string;
  const ids: Record<string, string> = {};
  let active: { id: string };
  let closed: { id: string };
  let draft: { id: string };

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const bulk = (challengeId: string, userIds: unknown, token = adminToken) =>
    request(http)
      .post(`/api/challenges/${challengeId}/participants/bulk`)
      .set(auth(token))
      .send(userIds === undefined ? {} : { userIds });
  const roster = async (challengeId: string) => {
    const res = await request(http).get(`/api/challenges/${challengeId}/participants`).set(auth(adminToken));
    expect(res.status).toBe(200);
    return (res.body as { userId: string }[]).map((p) => p.userId).sort();
  };
  const sorted = (...users: string[]) => users.map((u) => ids[u]).sort();

  async function login(email: string): Promise<string> {
    const res = await request(http).post('/api/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    return res.body.tokens.accessToken as string;
  }

  async function createChallenge(month: number, name: string) {
    const res = await request(http)
      .post('/api/challenges')
      .set(auth(adminToken))
      .send({
        name,
        month,
        year: YEAR,
        startDate: `${YEAR}-${String(month).padStart(2, '0')}-01T00:00:00.000Z`,
        endDate: `${YEAR}-${String(month).padStart(2, '0')}-28T00:00:00.000Z`,
        validDays: [0, 1, 2, 3, 4, 5, 6],
        minHeartRateMinutes: 0,
        feePerParticipant: 100,
        currency: 'BOB',
      });
    expect(res.status).toBe(201);
    return res.body as { id: string };
  }

  async function cleanup() {
    await prisma.challenge.deleteMany({ where: { year: YEAR } });
    await prisma.user.deleteMany({ where: { email: { startsWith: 'e2e-ren-' } } });
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
      data: { email: adminEmail, name: 'E2E Ren Admin', passwordHash, role: UserRole.ADMIN },
    });
    for (const n of names) {
      const u = await prisma.user.create({
        data: {
          email: `e2e-ren-${n}@reto.local`,
          name: `E2E Ren ${n}`,
          passwordHash,
          role: UserRole.PARTICIPANT,
          active: n !== 'luis',
        },
      });
      ids[n] = u.id;
    }
    adminToken = await login(adminEmail);
    participantToken = await login('e2e-ren-ana@reto.local');

    active = await createChallenge(1, 'E2E Ren activo');
    await request(http).post(`/api/challenges/${active.id}/activate`).set(auth(adminToken)).expect(201);
    closed = await createChallenge(2, 'E2E Ren cerrado');
    draft = await createChallenge(3, 'E2E Ren borrador');
  });

  afterAll(async () => {
    await cleanup();
    await app?.close();
  });

  it('BULK: lista mixta (ya inscrita, dos nuevas, inactivo, desconocido) con el resultado exacto', async () => {
    await request(http)
      .post(`/api/challenges/${active.id}/participants`)
      .set(auth(adminToken))
      .send({ userId: ids.ana })
      .expect(201);
    const unknown = randomUUID();
    const res = await bulk(active.id, [ids.ana, ids.bea, ids.carla, ids.luis, unknown]);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['alreadyEnrolled', 'enrolled', 'skipped']);
    expect(res.body.enrolled).toEqual([
      { userId: ids.bea, name: 'E2E Ren bea', email: 'e2e-ren-bea@reto.local' },
      { userId: ids.carla, name: 'E2E Ren carla', email: 'e2e-ren-carla@reto.local' },
    ]);
    expect(res.body.alreadyEnrolled).toEqual([
      { userId: ids.ana, name: 'E2E Ren ana', email: 'e2e-ren-ana@reto.local' },
    ]);
    expect(res.body.skipped).toEqual([
      { userId: ids.luis, reason: 'INACTIVE', message: 'El usuario está inactivo' },
      { userId: unknown, reason: 'NOT_FOUND', message: 'Usuario no encontrado' },
    ]);
    expect(await roster(active.id)).toEqual(sorted('ana', 'bea', 'carla'));
  });

  it('BULK: los inscritos empiezan impagos y sin comprobante en las finanzas', async () => {
    const res = await request(http).get(`/api/challenges/${active.id}/finance`).set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.participantsTotal).toBe(3);
    expect(res.body.collectedTotal).toBe(0);
    expect(res.body.counts).toEqual({ paid: 0, partial: 0, unpaid: 3 });
    const rows = await prisma.challengeParticipant.findMany({ where: { challengeId: active.id } });
    for (const r of rows) {
      expect(r.paid).toBe(false);
      expect(r.paidAt).toBeNull();
      expect(r.amountPaid).toBeNull();
      expect(r.paymentProofUrl).toBeNull();
      expect(r.paymentProofCloudinaryId).toBeNull();
    }
  });

  it('BULK: repetir la petición no inscribe a nadie nuevo', async () => {
    const res = await bulk(active.id, [ids.ana, ids.bea, ids.carla]);
    expect(res.status).toBe(200);
    expect(res.body.enrolled).toEqual([]);
    expect(res.body.alreadyEnrolled.map((r: { userId: string }) => r.userId).sort()).toEqual(
      sorted('ana', 'bea', 'carla'),
    );
    expect(res.body.skipped).toEqual([]);
    expect(await roster(active.id)).toEqual(sorted('ana', 'bea', 'carla'));
  });

  it('BULK: un id repetido cuenta una sola vez', async () => {
    const res = await bulk(active.id, [ids.diana, ids.diana]);
    expect(res.status).toBe(200);
    expect(res.body.enrolled).toHaveLength(1);
    expect(res.body.enrolled[0].userId).toBe(ids.diana);
    expect(await roster(active.id)).toEqual(sorted('ana', 'bea', 'carla', 'diana'));
    await request(http)
      .delete(`/api/challenges/${active.id}/participants/${ids.diana}`)
      .set(auth(adminToken))
      .expect(204);
  });

  it('BULK: 400 para lista vacía, 201 ids, un id que no es UUID, sin userIds y una clave desconocida', async () => {
    const many = Array.from({ length: 201 }, () => randomUUID());
    expect((await bulk(active.id, [])).status).toBe(400);
    expect((await bulk(active.id, many)).status).toBe(400);
    expect((await bulk(active.id, [ids.diana, 'no-es-uuid'])).status).toBe(400);
    expect((await bulk(active.id, undefined)).status).toBe(400);
    const extra = await request(http)
      .post(`/api/challenges/${active.id}/participants/bulk`)
      .set(auth(adminToken))
      .send({ userIds: [ids.diana], extra: true });
    expect(extra.status).toBe(400);
    expect(await roster(active.id)).toEqual(sorted('ana', 'bea', 'carla'));
  });

  it('BULK: 200 ids son aceptados (el tope es 200)', async () => {
    const res = await bulk(
      active.id,
      Array.from({ length: 200 }, () => randomUUID()),
    );
    expect(res.status).toBe(200);
    expect(res.body.skipped).toHaveLength(200);
    expect(res.body.enrolled).toEqual([]);
  });

  it('BULK: un participante recibe 403 y no inscribe a nadie', async () => {
    const res = await bulk(active.id, [ids.diana], participantToken);
    expect(res.status).toBe(403);
    expect(await roster(active.id)).toEqual(sorted('ana', 'bea', 'carla'));
  });

  it('BULK: reto desconocido responde 404', async () => {
    const res = await bulk(randomUUID(), [ids.diana]);
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Reto no encontrado');
  });

  it('BULK: un reto cerrado responde 400 completo y deja el roster intacto', async () => {
    await prisma.challengeParticipant.create({ data: { challengeId: closed.id, userId: ids.ana } });
    await prisma.challenge.update({ where: { id: closed.id }, data: { status: ChallengeStatus.COMPLETED } });
    const res = await bulk(closed.id, [ids.bea, ids.carla, ids.diana]);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('No se puede modificar un reto cerrado');
    expect(await roster(closed.id)).toEqual(sorted('ana'));
  });

  it('BULK: se puede inscribir en un borrador', async () => {
    const res = await bulk(draft.id, [ids.bea, ids.carla]);
    expect(res.status).toBe(200);
    expect(res.body.enrolled).toHaveLength(2);
    expect(await roster(draft.id)).toEqual(sorted('bea', 'carla'));
  });

  it('BULK: la inscripción individual también rechaza a un usuario inactivo con 400', async () => {
    const res = await request(http)
      .post(`/api/challenges/${active.id}/participants`)
      .set(auth(adminToken))
      .send({ userId: ids.luis });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('El usuario está inactivo');
    expect(await roster(active.id)).toEqual(sorted('ana', 'bea', 'carla'));
  });

  it('BULK: una inscripción hecha por otra transacción abierta queda como ya inscrita', async () => {
    const target = await createChallenge(4, 'E2E Ren concurrente');
    const service = app.get(ChallengesService);
    let releaseA!: () => void;
    const holdA = new Promise<void>((resolve) => (releaseA = resolve));
    let aInserted!: () => void;
    const inserted = new Promise<void>((resolve) => (aInserted = resolve));
    // Transacción A: inscribe a Z (bea) y queda abierta hasta que el test la libere.
    const txA = prisma.$transaction(
      async (tx) => {
        await tx.challengeParticipant.create({ data: { challengeId: target.id, userId: ids.bea } });
        aInserted();
        await holdA;
      },
      { timeout: 20_000 },
    );
    await inserted;
    // Transacción B: inscripción en bloque de Y (diana) y Z (bea); se queda esperando a A.
    const pendingB = service.bulkAddParticipants(target.id, [ids.diana, ids.bea]);
    const deadline = Date.now() + 10_000;
    let blocked = false;
    while (!blocked && Date.now() < deadline) {
      const waiting = await prisma.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()`;
      blocked = (waiting[0]?.n ?? 0) > 0;
      if (!blocked) await new Promise((r) => setImmediate(r));
    }
    releaseA();
    await txA;
    const result = await pendingB;
    expect(result.enrolled.map((e) => e.userId)).toEqual([ids.diana]);
    expect(result.alreadyEnrolled.map((e) => e.userId)).toEqual([ids.bea]);
    expect(result.skipped).toEqual([]);
    expect(await roster(target.id)).toEqual(sorted('bea', 'diana'));
  });

  it('BULK: dos inscripciones en bloque simultáneas dejan a cada usuario en una sola lista de cada respuesta y una sola vez en el roster', async () => {
    const target = await createChallenge(5, 'E2E Ren simultáneo');
    const wanted = [ids.ana, ids.bea, ids.carla];
    const [r1, r2] = await Promise.all([bulk(target.id, wanted), bulk(target.id, wanted)]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    const listsOf = (body: { enrolled: { userId: string }[]; alreadyEnrolled: { userId: string }[]; skipped: { userId: string }[] }) =>
      [...body.enrolled, ...body.alreadyEnrolled, ...body.skipped].map((r) => r.userId).sort();
    expect(listsOf(r1.body)).toEqual([...wanted].sort());
    expect(listsOf(r2.body)).toEqual([...wanted].sort());
    const enrolledIn1 = new Set((r1.body.enrolled as { userId: string }[]).map((r) => r.userId));
    for (const e of r2.body.enrolled as { userId: string }[]) expect(enrolledIn1.has(e.userId)).toBe(false);
    expect(await roster(target.id)).toEqual([...wanted].sort());
  });
});

/**
 * E2E de la renovación mensual (OpenSpec: monthly-challenge-renewal, challenge-renewal).
 * Datos propios (años 2090 y 2091, usuarios `e2e-rnw-*`), limpiados al inicio y al final.
 */
describe('RENEW: renovación mensual (e2e)', () => {
  let app: INestApplication;
  let http: import('http').Server;
  let prisma: PrismaService;

  const YEAR = 2091;
  const DEC_YEAR = 2090;
  const password = 'Secret123';
  const adminEmail = 'e2e-rnw-admin@reto.local';
  const names = ['ana', 'bea', 'carla', 'luis'];

  let adminToken: string;
  let participantToken: string;
  const ids: Record<string, string> = {};
  let octubre: { id: string }; // ACTIVE, 10/YEAR -> 11/YEAR
  let junio: { id: string }; // COMPLETED, 6/YEAR -> 7/YEAR
  let borrador: { id: string }; // DRAFT, 3/YEAR
  let abril: { id: string }; // ACTIVE, 4/YEAR -> 5/YEAR (renovaciones simultáneas)
  let diciembre: { id: string }; // ACTIVE, 12/DEC_YEAR -> 1/YEAR

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const preview = (id: string, token = adminToken) =>
    request(http).get(`/api/challenges/${id}/renewal-preview`).set(auth(token));
  const renew = (id: string, body: Record<string, unknown> = {}, token = adminToken) =>
    request(http).post(`/api/challenges/${id}/renew`).set(auth(token)).send(body);
  const roster = async (challengeId: string) =>
    (await prisma.challengeParticipant.findMany({ where: { challengeId } })).map((p) => p.userId).sort();
  const sorted = (...users: string[]) => users.map((u) => ids[u]).sort();
  const lastDay = (month: number, year: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

  async function login(email: string): Promise<string> {
    const res = await request(http).post('/api/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    return res.body.tokens.accessToken as string;
  }

  async function createChallenge(month: number, year: number, name: string, extra: Record<string, unknown> = {}) {
    const mm = String(month).padStart(2, '0');
    const res = await request(http)
      .post('/api/challenges')
      .set(auth(adminToken))
      .send({
        name,
        month,
        year,
        startDate: `${year}-${mm}-03`,
        endDate: `${year}-${mm}-20`,
        validDays: [1, 2, 3, 4, 5],
        minHeartRateMinutes: 25,
        feePerParticipant: 150,
        currency: 'USD',
        prizeDescription: 'Zapatillas',
        pointsPerValidatedDay: 2,
        pointsPerKm: 0.5,
        minValidatedDaysToQualify: 10,
        maxWinners: 3,
        tiebreakRule: 'TOTAL_KM',
        ...extra,
      });
    expect(res.status).toBe(201);
    return res.body as { id: string };
  }

  async function cleanup() {
    await prisma.challenge.deleteMany({ where: { year: { in: [YEAR, DEC_YEAR] } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: 'e2e-rnw-' } } });
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
      data: { email: adminEmail, name: 'E2E Rnw Admin', passwordHash, role: UserRole.ADMIN },
    });
    for (const n of names) {
      const u = await prisma.user.create({
        data: {
          email: `e2e-rnw-${n}@reto.local`,
          name: `E2E Rnw ${n}`,
          passwordHash,
          role: UserRole.PARTICIPANT,
          active: n !== 'luis',
        },
      });
      ids[n] = u.id;
    }
    adminToken = await login(adminEmail);
    participantToken = await login('e2e-rnw-ana@reto.local');

    octubre = await createChallenge(10, YEAR, 'E2E Rnw octubre');
    await request(http).post(`/api/challenges/${octubre.id}/activate`).set(auth(adminToken)).expect(201);
    junio = await createChallenge(6, YEAR, 'E2E Rnw junio', { budgetTotal: 600 });
    borrador = await createChallenge(3, YEAR, 'E2E Rnw borrador');
    abril = await createChallenge(4, YEAR, 'E2E Rnw abril');
    await request(http).post(`/api/challenges/${abril.id}/activate`).set(auth(adminToken)).expect(201);
    diciembre = await createChallenge(12, DEC_YEAR, 'E2E Rnw diciembre');
    await request(http).post(`/api/challenges/${diciembre.id}/activate`).set(auth(adminToken)).expect(201);

    // Inscritos con pagos y comprobante en el origen (Luis quedó inactivo después de inscribirse)
    const paidAt = new Date('2091-10-05T00:00:00.000Z');
    for (const challengeId of [octubre.id, junio.id, abril.id]) {
      await prisma.challengeParticipant.createMany({
        data: [
          { challengeId, userId: ids.ana, paid: true, paidAt, amountPaid: 150 },
          {
            challengeId,
            userId: ids.bea,
            paymentProofUrl: 'https://x/proof.png',
            paymentProofCloudinaryId: 'proof-1',
            paymentProofUploadedAt: paidAt,
          },
          { challengeId, userId: ids.luis },
        ],
      });
    }
    // El reto cerrado, con actividades validadas y una premiación
    await prisma.dailyActivity.create({
      data: {
        challengeId: junio.id,
        userId: ids.ana,
        date: new Date(`${YEAR}-06-10T00:00:00.000Z`),
        exerciseType: ExerciseType.RUNNING,
        durationMinutes: 30,
        status: ActivityStatus.VALIDATED,
      },
    });
    await prisma.challengeAward.create({ data: { challengeId: junio.id, userId: ids.ana, notes: 'Ganó' } });
    await prisma.challenge.update({ where: { id: junio.id }, data: { status: ChallengeStatus.COMPLETED } });
  });

  afterAll(async () => {
    await cleanup();
    await app?.close();
  });

  it('RENEW: la vista previa de un reto activo trae mes siguiente, período, reglas y a quién se copia', async () => {
    const res = await preview(octubre.id);
    expect(res.status).toBe(200);
    expect(res.body.source).toEqual({
      id: octubre.id,
      name: 'E2E Rnw octubre',
      month: 10,
      year: YEAR,
      status: 'ACTIVE',
    });
    expect(res.body.target).toEqual({
      month: 11,
      year: YEAR,
      name: `Reto Noviembre ${YEAR}`,
      startDate: `${YEAR}-11-01`,
      endDate: `${YEAR}-11-30`,
    });
    expect(res.body.rules).toMatchObject({
      validDays: [1, 2, 3, 4, 5],
      minHeartRateMinutes: 25,
      budgetTotal: null,
      budgetMode: 'auto',
      currency: 'USD',
      prizeDescription: 'Zapatillas',
      pointsPerValidatedDay: 2,
      minValidatedDaysToQualify: 10,
      maxWinners: 3,
      tiebreakRule: 'TOTAL_KM',
    });
    expect(Number(res.body.rules.feePerParticipant)).toBe(150);
    expect(Number(res.body.rules.pointsPerKm)).toBe(0.5);
    expect(res.body.participants.toCopy).toEqual([
      { userId: ids.ana, name: 'E2E Rnw ana', email: 'e2e-rnw-ana@reto.local' },
      { userId: ids.bea, name: 'E2E Rnw bea', email: 'e2e-rnw-bea@reto.local' },
    ]);
    expect(res.body.participants.skipped).toEqual([
      {
        userId: ids.luis,
        name: 'E2E Rnw luis',
        email: 'e2e-rnw-luis@reto.local',
        reason: 'INACTIVE',
        message: 'El usuario está inactivo',
      },
    ]);
    expect(res.body.existing).toBeNull();
    // solo lectura: nada nuevo
    expect(await prisma.challenge.count({ where: { month: 11, year: YEAR } })).toBe(0);
  });

  it('RENEW: la vista previa de diciembre cae en enero del año siguiente y la de un cerrado marca el presupuesto manual', async () => {
    const dec = await preview(diciembre.id);
    expect(dec.status).toBe(200);
    expect(dec.body.target).toMatchObject({
      month: 1,
      year: YEAR,
      startDate: `${YEAR}-01-01`,
      endDate: `${YEAR}-01-31`,
    });
    const closed = await preview(junio.id);
    expect(closed.status).toBe(200);
    expect(closed.body.source.status).toBe('COMPLETED');
    expect(closed.body.rules.budgetMode).toBe('manual');
    expect(Number(closed.body.rules.budgetTotal)).toBe(600);
  });

  it('RENEW: renovar sin copiar participantes crea el borrador exacto del mes siguiente', async () => {
    const res = await renew(octubre.id, {});
    expect(res.status).toBe(201);
    expect(res.body.participants).toEqual({ enrolled: [], skipped: [] });
    const created = await prisma.challenge.findUniqueOrThrow({ where: { id: res.body.challenge.id } });
    expect(created).toMatchObject({
      name: `Reto Noviembre ${YEAR}`,
      month: 11,
      year: YEAR,
      status: ChallengeStatus.DRAFT,
      validDays: [1, 2, 3, 4, 5],
      minHeartRateMinutes: 25,
      budgetTotal: null,
      currency: 'USD',
      prizeDescription: 'Zapatillas',
      pointsPerValidatedDay: 2,
      minValidatedDaysToQualify: 10,
      maxWinners: 3,
      tiebreakRule: 'TOTAL_KM',
    });
    expect(Number(created.feePerParticipant)).toBe(150);
    expect(Number(created.pointsPerKm)).toBe(0.5);
    expect(created.startDate.toISOString()).toBe(`${YEAR}-11-01T00:00:00.000Z`);
    expect(created.endDate.toISOString()).toBe(`${YEAR}-11-30T00:00:00.000Z`);
    expect(await roster(created.id)).toEqual([]);
  });

  it('RENEW: copyParticipants que no es booleano responde 400 y el nombre pasa de 100 caracteres no', async () => {
    expect((await renew(octubre.id, { copyParticipants: 'false' })).status).toBe(400);
    expect((await renew(octubre.id, { name: 'a'.repeat(101) })).status).toBe(400);
  });

  it('RENEW: renovar otra vez responde 409 con existingChallengeId y no inscribe a nadie', async () => {
    const existing = await prisma.challenge.findUniqueOrThrow({
      where: { month_year: { month: 11, year: YEAR } },
    });
    const res = await renew(octubre.id, { copyParticipants: true });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe(`Ya existe un reto para 11/${YEAR}`);
    expect(res.body.existingChallengeId).toBe(existing.id);
    expect(await roster(existing.id)).toEqual([]);
    expect(await prisma.challenge.count({ where: { month: 11, year: YEAR } })).toBe(1);
    // y la vista previa lo informa
    const p = await preview(octubre.id);
    expect(p.body.existing).toEqual({ id: existing.id, name: existing.name, status: 'DRAFT' });
    // el borrador renovado se activa con la regla de siempre
    await request(http).post(`/api/challenges/${existing.id}/activate`).set(auth(adminToken)).expect(201);
  });

  it('RENEW: un reto cerrado con nombre propio copia a los activos impagos y sin comprobante; el origen no cambia', async () => {
    const before = await prisma.challengeParticipant.findMany({
      where: { challengeId: junio.id },
      orderBy: { userId: 'asc' },
    });
    const res = await renew(junio.id, { name: '  Reto Primavera  ', copyParticipants: true });
    expect(res.status).toBe(201);
    expect(res.body.challenge).toMatchObject({ name: 'Reto Primavera', status: 'DRAFT', month: 7, year: YEAR });
    expect(res.body.participants.enrolled.map((r: { userId: string }) => r.userId).sort()).toEqual(
      sorted('ana', 'bea'),
    );
    expect(res.body.participants.skipped).toEqual([
      { userId: ids.luis, reason: 'INACTIVE', message: 'El usuario está inactivo' },
    ]);
    const newId = res.body.challenge.id as string;
    expect(await roster(newId)).toEqual(sorted('ana', 'bea'));
    for (const row of await prisma.challengeParticipant.findMany({ where: { challengeId: newId } })) {
      expect(row.paid).toBe(false);
      expect(row.paidAt).toBeNull();
      expect(row.amountPaid).toBeNull();
      expect(row.paymentProofUrl).toBeNull();
      expect(row.paymentProofCloudinaryId).toBeNull();
      expect(row.paymentProofUploadedAt).toBeNull();
    }
    // nada histórico ni financiero se copió
    expect(await prisma.dailyActivity.count({ where: { challengeId: newId } })).toBe(0);
    expect(await prisma.challengeAward.count({ where: { challengeId: newId } })).toBe(0);
    const fin = await request(http).get(`/api/challenges/${newId}/finance`).set(auth(adminToken));
    expect(fin.status).toBe(200);
    expect(fin.body.collectedTotal).toBe(0);
    expect(fin.body.counts).toEqual({ paid: 0, partial: 0, unpaid: 2 });
    // el origen sigue igual: estado, reglas, pagos, comprobantes, actividades y premios
    const source = await prisma.challenge.findUniqueOrThrow({ where: { id: junio.id } });
    expect(source.status).toBe(ChallengeStatus.COMPLETED);
    expect(Number(source.budgetTotal)).toBe(600);
    expect(source.name).toBe('E2E Rnw junio');
    const after = await prisma.challengeParticipant.findMany({
      where: { challengeId: junio.id },
      orderBy: { userId: 'asc' },
    });
    expect(after).toEqual(before);
    expect(await prisma.dailyActivity.count({ where: { challengeId: junio.id } })).toBe(1);
    expect(await prisma.challengeAward.count({ where: { challengeId: junio.id } })).toBe(1);
  });

  it('RENEW: diciembre se renueva en enero del año siguiente', async () => {
    const res = await renew(diciembre.id, {});
    expect(res.status).toBe(201);
    expect(res.body.challenge).toMatchObject({ month: 1, year: YEAR, name: `Reto Enero ${YEAR}` });
    expect(res.body.challenge.endDate).toBe(`${YEAR}-01-${lastDay(1, YEAR)}T00:00:00.000Z`);
  });

  it('RENEW: dos renovaciones simultáneas dejan un solo reto: un 201 y un 409', async () => {
    const [a, b] = await Promise.all([
      renew(abril.id, { copyParticipants: true }),
      renew(abril.id, { copyParticipants: true }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const loser = a.status === 409 ? a : b;
    const winner = a.status === 201 ? a : b;
    expect(loser.body.existingChallengeId).toBe(winner.body.challenge.id);
    expect(await prisma.challenge.count({ where: { month: 5, year: YEAR } })).toBe(1);
    expect(await roster(winner.body.challenge.id)).toEqual(sorted('ana', 'bea'));
  });

  it('RENEW: un borrador de origen responde 400 en la vista previa y al renovar, sin crear nada', async () => {
    const total = await prisma.challenge.count({ where: { year: YEAR } });
    const p = await preview(borrador.id);
    expect(p.status).toBe(400);
    expect(p.body.message).toBe('Solo se puede renovar un reto activo o cerrado');
    const r = await renew(borrador.id, {});
    expect(r.status).toBe(400);
    expect(r.body.message).toBe('Solo se puede renovar un reto activo o cerrado');
    expect(await prisma.challenge.count({ where: { year: YEAR } })).toBe(total);
  });

  it('RENEW: nombre en blanco y clave desconocida responden 400', async () => {
    const before = await prisma.challenge.count({ where: { year: YEAR } });
    expect((await renew(octubre.id, { name: '   ' })).status).toBe(400);
    expect((await renew(octubre.id, { month: 12 })).status).toBe(400);
    expect(await prisma.challenge.count({ where: { year: YEAR } })).toBe(before);
  });

  it('RENEW: un participante recibe 403 en ambas rutas y un reto desconocido 404', async () => {
    expect((await preview(octubre.id, participantToken)).status).toBe(403);
    expect((await renew(octubre.id, {}, participantToken)).status).toBe(403);
    expect((await preview(randomUUID())).status).toBe(404);
    const r = await renew(randomUUID());
    expect(r.status).toBe(404);
    expect(r.body.message).toBe('Reto no encontrado');
  });
});
