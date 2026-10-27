import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ChallengeStatus, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import { randomUUID } from 'crypto';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * E2E de inscripción en bloque (OpenSpec: monthly-challenge-renewal, challenge-enrollment).
 * Datos propios (año 2092, usuarios `e2e-ren-*`), limpiados al inicio y al final.
 * El bloque `RENEW:` de la renovación llega con el PR 2.
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
});
