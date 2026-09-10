import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * E2E del ciclo de vida de retos y de múltiples retos activos
 * (OpenSpec: openspec/changes/multi-active-challenges/specs/challenge-lifecycle/spec.md).
 *
 * Requiere Postgres vía DATABASE_URL con migraciones aplicadas. Crea sus propios usuarios
 * (prefijo `e2e-lifecycle`) y retos (año 2200) y los limpia al inicio para ser idempotente.
 */
describe('Ciclo de vida de retos y múltiples activos (e2e)', () => {
  let app: INestApplication;
  let http: import('http').Server;
  let prisma: PrismaService;

  const YEAR = 2200;
  const password = 'Secret123';
  const adminEmail = 'e2e-lifecycle-admin@reto.local';
  const anaEmail = 'e2e-lifecycle-ana@reto.local';
  const DATE_IN_BOTH = `${YEAR}-01-05`;

  let adminToken: string;
  let anaToken: string;
  let anaId: string;
  let challengeA: { id: string };
  let challengeB: { id: string };

  const photo = {
    url: 'https://example.com/e2e/activity.jpg',
    cloudinaryId: 'e2e/lifecycle/activity',
    type: 'ACTIVITY',
  };
  const hrPhoto = {
    url: 'https://example.com/e2e/hr.jpg',
    cloudinaryId: 'e2e/lifecycle/hr',
    type: 'HEART_RATE',
  };

  // Cumple la regla de FC por defecto (minHeartRateMinutes = 20): minutos con FC + captura
  function activityBody(challengeId: string, date: string) {
    return {
      challengeId,
      date,
      exerciseType: 'RUNNING',
      durationMinutes: 30,
      distanceKm: 5,
      avgHeartRate: 140,
      heartRateMinutes: 25,
      photos: [photo, hrPhoto],
    };
  }

  async function login(email: string): Promise<string> {
    const res = await request(http).post('/api/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    return res.body.tokens.accessToken as string;
  }

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

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

    // Limpieza idempotente de corridas anteriores (cascade borra participantes/actividades/premios)
    await prisma.challenge.deleteMany({ where: { year: YEAR } });
    await prisma.user.deleteMany({ where: { email: { startsWith: 'e2e-lifecycle-' } } });

    const passwordHash = await argon2.hash(password);
    await prisma.user.create({
      data: { email: adminEmail, name: 'E2E Admin', passwordHash, role: UserRole.ADMIN },
    });
    const ana = await prisma.user.create({
      data: { email: anaEmail, name: 'E2E Ana', passwordHash, role: UserRole.PARTICIPANT },
    });
    anaId = ana.id;

    adminToken = await login(adminEmail);
    anaToken = await login(anaEmail);
  });

  afterAll(async () => {
    // No dejar retos/usuarios de prueba activos en la BD (afectarían a la UI y al script de sesiones)
    await prisma?.challenge.deleteMany({ where: { year: YEAR } });
    await prisma?.user.deleteMany({ where: { email: { startsWith: 'e2e-lifecycle-' } } });
    await app?.close();
  });

  it('admin crea dos retos en DRAFT con fechas que se solapan', async () => {
    const base = {
      validDays: [0, 1, 2, 3, 4, 5, 6],
      minHeartRateMinutes: 20,
      feePerParticipant: 10,
      budgetTotal: 100,
      currency: 'BOB',
    };
    const resA = await request(http)
      .post('/api/challenges')
      .set(auth(adminToken))
      .send({
        ...base,
        name: 'E2E Reto A',
        month: 1,
        year: YEAR,
        startDate: `${YEAR}-01-01T00:00:00.000Z`,
        endDate: `${YEAR}-01-31T23:59:59.000Z`,
      });
    expect(resA.status).toBe(201);
    expect(resA.body.status).toBe('DRAFT');
    challengeA = resA.body;

    const resB = await request(http)
      .post('/api/challenges')
      .set(auth(adminToken))
      .send({
        ...base,
        name: 'E2E Reto B',
        month: 2,
        year: YEAR,
        startDate: `${YEAR}-01-02T00:00:00.000Z`,
        endDate: `${YEAR}-02-28T23:59:59.000Z`,
      });
    expect(resB.status).toBe(201);
    challengeB = resB.body;
  });

  it('un participante no puede activar retos (403)', async () => {
    const res = await request(http)
      .post(`/api/challenges/${challengeA.id}/activate`)
      .set(auth(anaToken));
    expect(res.status).toBe(403);
  });

  it('activar A: DRAFT -> ACTIVE', async () => {
    const res = await request(http)
      .post(`/api/challenges/${challengeA.id}/activate`)
      .set(auth(adminToken));
    expect(res.status).toBe(201); // POST sin @HttpCode explícito responde 201 en Nest
    expect(res.body.status).toBe('ACTIVE');
  });

  it('activar B mientras A está activo: ambos quedan ACTIVE', async () => {
    const res = await request(http)
      .post(`/api/challenges/${challengeB.id}/activate`)
      .set(auth(adminToken));
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('ACTIVE');

    const a = await request(http).get(`/api/challenges/${challengeA.id}`).set(auth(adminToken));
    expect(a.body.status).toBe('ACTIVE');
  });

  it('reactivar A es idempotente', async () => {
    const res = await request(http)
      .post(`/api/challenges/${challengeA.id}/activate`)
      .set(auth(adminToken));
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('ACTIVE');
  });

  it('GET /challenges/active/list: más reciente primero e isParticipant por usuario', async () => {
    const add = await request(http)
      .post(`/api/challenges/${challengeA.id}/participants`)
      .set(auth(adminToken))
      .send({ userId: anaId });
    expect(add.status).toBe(201);

    const res = await request(http).get('/api/challenges/active/list').set(auth(anaToken));
    expect(res.status).toBe(200);
    const ours = (res.body as { id: string; isParticipant: boolean }[]).filter(
      (c) => c.id === challengeA.id || c.id === challengeB.id,
    );
    expect(ours.map((c) => c.id)).toEqual([challengeB.id, challengeA.id]);
    expect(ours.map((c) => c.isParticipant)).toEqual([false, true]);
  });

  it('GET /challenges/active: prefiere el reto donde participa el usuario', async () => {
    const res = await request(http).get('/api/challenges/active').set(auth(anaToken));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(challengeA.id);
  });

  it('GET /challenges/active: sin participación devuelve el activo más reciente', async () => {
    const res = await request(http).get('/api/challenges/active').set(auth(adminToken));
    expect(res.status).toBe(200);
    // B es el activo con startDate más reciente entre los creados aquí (2200); cualquier reto
    // seed tiene startDate anterior.
    expect(res.body.id).toBe(challengeB.id);
  });

  it('actividades por reto: misma fecha en A y B (201 x2), duplicado en A -> 409, rankings independientes', async () => {
    const addB = await request(http)
      .post(`/api/challenges/${challengeB.id}/participants`)
      .set(auth(adminToken))
      .send({ userId: anaId });
    expect(addB.status).toBe(201);

    const inA = await request(http)
      .post('/api/activities')
      .set(auth(anaToken))
      .send(activityBody(challengeA.id, DATE_IN_BOTH));
    expect(inA.status).toBe(201);

    const inB = await request(http)
      .post('/api/activities')
      .set(auth(anaToken))
      .send(activityBody(challengeB.id, DATE_IN_BOTH));
    expect(inB.status).toBe(201);

    const dup = await request(http)
      .post('/api/activities')
      .set(auth(anaToken))
      .send(activityBody(challengeA.id, DATE_IN_BOTH));
    expect(dup.status).toBe(409);

    for (const id of [inA.body.id, inB.body.id]) {
      const val = await request(http)
        .post(`/api/activities/${id}/validate`)
        .set(auth(adminToken));
      expect([200, 201]).toContain(val.status);
    }

    const resA = await request(http)
      .get(`/api/challenges/${challengeA.id}/results`)
      .set(auth(anaToken));
    const resB = await request(http)
      .get(`/api/challenges/${challengeB.id}/results`)
      .set(auth(anaToken));
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    // Un día validado en cada reto: si se mezclaran, alguno mostraría 2
    expect(resA.body.topScore).toBe(1);
    expect(resB.body.topScore).toBe(1);
  });

  it('cerrar A mantiene B activo y A ya no aparece en la lista', async () => {
    const close = await request(http)
      .post(`/api/challenges/${challengeA.id}/close`)
      .set(auth(adminToken));
    expect(close.status).toBe(201);
    expect(close.body.status).toBe('COMPLETED');

    const list = await request(http).get('/api/challenges/active/list').set(auth(anaToken));
    const ids = (list.body as { id: string }[]).map((c) => c.id);
    expect(ids).toContain(challengeB.id);
    expect(ids).not.toContain(challengeA.id);
  });

  it('un reto COMPLETED no puede reactivarse (400), ni por PATCH', async () => {
    const res = await request(http)
      .post(`/api/challenges/${challengeA.id}/activate`)
      .set(auth(adminToken));
    expect(res.status).toBe(400);

    const patch = await request(http)
      .patch(`/api/challenges/${challengeA.id}`)
      .set(auth(adminToken))
      .send({ status: 'ACTIVE' });
    expect(patch.status).toBe(400);

    const a = await request(http).get(`/api/challenges/${challengeA.id}`).set(auth(adminToken));
    expect(a.body.status).toBe('COMPLETED');
  });
});
