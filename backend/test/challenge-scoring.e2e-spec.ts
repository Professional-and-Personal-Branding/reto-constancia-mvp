import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ActivityStatus, ExerciseType, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * E2E de las reglas de puntaje configurables (OpenSpec: challenge-scoring).
 * Datos propios (año 2096, usuarios `e2e-score-*`), limpiados al inicio y al final.
 */
describe('Reglas de puntaje configurables (e2e)', () => {
  let app: INestApplication;
  let http: import('http').Server;
  let prisma: PrismaService;

  const YEAR = 2096;
  const password = 'Secret123';
  const adminEmail = 'e2e-score-admin@reto.local';
  const participantEmails = ['e2e-score-p1@reto.local', 'e2e-score-p2@reto.local', 'e2e-score-p3@reto.local'];

  let adminToken: string;
  let ids: string[] = [];
  let custom: { id: string };
  let shared: { id: string };

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function login(email: string) {
    const res = await request(http).post('/api/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    return res.body.tokens.accessToken as string;
  }

  async function cleanup() {
    await prisma.challenge.deleteMany({ where: { year: YEAR } });
    await prisma.user.deleteMany({ where: { email: { startsWith: 'e2e-score-' } } });
  }

  /** Crea `days` actividades validadas repartiendo `totalKm` en la primera. */
  async function seedActivities(challengeId: string, userId: string, days: number, totalKm: number) {
    for (let i = 0; i < days; i++) {
      await prisma.dailyActivity.create({
        data: {
          challengeId,
          userId,
          date: new Date(`${YEAR}-01-${String(i + 2).padStart(2, '0')}T00:00:00.000Z`),
          exerciseType: ExerciseType.RUNNING,
          durationMinutes: 30,
          distanceKm: i === 0 ? totalKm : 0,
          status: ActivityStatus.VALIDATED,
        },
      });
    }
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
    await prisma.user.create({ data: { email: adminEmail, name: 'E2E Score Admin', passwordHash, role: UserRole.ADMIN } });
    ids = [];
    for (const [i, email] of participantEmails.entries()) {
      const u = await prisma.user.create({ data: { email, name: `E2E Score P${i + 1}`, passwordHash, role: UserRole.PARTICIPANT } });
      ids.push(u.id);
    }
    adminToken = await login(adminEmail);
  });

  afterAll(async () => {
    await cleanup();
    await app?.close();
  });

  it('rechaza una configuración inválida (maxWinners = 0)', async () => {
    const res = await request(http).post('/api/challenges').set(auth(adminToken)).send({
      name: 'E2E inválido', month: 6, year: YEAR,
      startDate: `${YEAR}-06-01T00:00:00.000Z`, endDate: `${YEAR}-06-30T23:59:59.000Z`,
      maxWinners: 0,
    });
    expect(res.status).toBe(400);
  });

  it('crea un reto con reglas propias y las persiste', async () => {
    const res = await request(http).post('/api/challenges').set(auth(adminToken)).send({
      name: 'E2E puntaje', month: 1, year: YEAR,
      startDate: `${YEAR}-01-01T00:00:00.000Z`, endDate: `${YEAR}-01-31T23:59:59.000Z`,
      validDays: [0, 1, 2, 3, 4, 5, 6], minHeartRateMinutes: 0, budgetTotal: 600,
      pointsPerValidatedDay: 10, pointsPerKm: 1, minValidatedDaysToQualify: 2,
      maxWinners: 1, tiebreakRule: 'TOTAL_KM',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      pointsPerValidatedDay: 10,
      minValidatedDaysToQualify: 2,
      maxWinners: 1,
      tiebreakRule: 'TOTAL_KM',
    });
    expect(Number(res.body.pointsPerKm)).toBe(1);
    custom = res.body;

    await request(http).post(`/api/challenges/${custom.id}/activate`).set(auth(adminToken));
    for (const userId of ids) {
      const add = await request(http).post(`/api/challenges/${custom.id}/participants`).set(auth(adminToken)).send({ userId });
      expect(add.status).toBe(201);
    }
    // p1: 3 días + 10 km = 40 · p2: 2 días + 20 km = 40 · p3: 1 día + 50 km = 60 pero no califica
    await seedActivities(custom.id, ids[0], 3, 10);
    await seedActivities(custom.id, ids[1], 2, 20);
    await seedActivities(custom.id, ids[2], 1, 50);
  });

  it('el ranking expone score y qualified, y el mínimo deja fuera al de mayor puntaje', async () => {
    const res = await request(http).get(`/api/challenges/${custom.id}/results`).set(auth(adminToken));
    expect(res.status).toBe(200);
    const byUser = Object.fromEntries(
      (res.body.ranking as { userId: string; score: number; qualified: boolean }[]).map((r) => [r.userId, r]),
    );
    expect(byUser[ids[0]]).toMatchObject({ score: 40, qualified: true });
    expect(byUser[ids[1]]).toMatchObject({ score: 40, qualified: true });
    expect(byUser[ids[2]]).toMatchObject({ score: 60, qualified: false });
    // El no calificado encabeza el ranking por puntaje pero no define el tope
    expect(res.body.ranking[0].userId).toBe(ids[2]);
    expect(res.body.topScore).toBe(40);
    expect(res.body.notes.join(' ')).toMatch(/Mínimo para calificar/);
  });

  it('desempata por kilómetros y entrega el pote completo al único ganador', async () => {
    const res = await request(http).get(`/api/challenges/${custom.id}/results`).set(auth(adminToken));
    expect((res.body.tiedAtTop as { userId: string }[]).map((t) => t.userId).sort()).toEqual([ids[0], ids[1]].sort());
    expect(res.body.winners).toHaveLength(1);
    expect(res.body.winners[0].userId).toBe(ids[1]); // 20 km contra 10 km
    expect(res.body.drawNeeded).toBe(false);
    expect(res.body.payout).toMatchObject({ pot: 600, winnersCount: 1, perWinner: 600 });
  });

  it('SHARE_ALL reparte el premio entre todos los empatados', async () => {
    const res = await request(http).post('/api/challenges').set(auth(adminToken)).send({
      name: 'E2E compartido', month: 2, year: YEAR,
      startDate: `${YEAR}-01-01T00:00:00.000Z`, endDate: `${YEAR}-01-31T23:59:59.000Z`,
      validDays: [0, 1, 2, 3, 4, 5, 6], minHeartRateMinutes: 0, budgetTotal: 500,
      maxWinners: 1, tiebreakRule: 'SHARE_ALL',
    });
    expect(res.status).toBe(201);
    shared = res.body;
    await request(http).post(`/api/challenges/${shared.id}/activate`).set(auth(adminToken));
    for (const userId of [ids[0], ids[1]]) {
      await request(http).post(`/api/challenges/${shared.id}/participants`).set(auth(adminToken)).send({ userId });
      await seedActivities(shared.id, userId, 1, 5);
    }

    const results = await request(http).get(`/api/challenges/${shared.id}/results`).set(auth(adminToken));
    expect(results.body.winners).toHaveLength(2);
    expect(results.body.drawNeeded).toBe(false);
    expect(results.body.payout).toMatchObject({ winnersCount: 2, perWinner: 250 });
  });

  it('un reto sin reglas propias mantiene el comportamiento histórico', async () => {
    const res = await request(http).post('/api/challenges').set(auth(adminToken)).send({
      name: 'E2E defaults', month: 3, year: YEAR,
      startDate: `${YEAR}-01-01T00:00:00.000Z`, endDate: `${YEAR}-01-31T23:59:59.000Z`,
      validDays: [0, 1, 2, 3, 4, 5, 6], minHeartRateMinutes: 0,
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      pointsPerValidatedDay: 1,
      minValidatedDaysToQualify: 0,
      maxWinners: 2,
      tiebreakRule: 'DRAW',
    });
    await request(http).post(`/api/challenges/${res.body.id}/activate`).set(auth(adminToken));
    await request(http).post(`/api/challenges/${res.body.id}/participants`).set(auth(adminToken)).send({ userId: ids[0] });
    await seedActivities(res.body.id, ids[0], 2, 7);

    const results = await request(http).get(`/api/challenges/${res.body.id}/results`).set(auth(adminToken));
    // Con los defaults el puntaje son los días validados
    expect(results.body.ranking[0]).toMatchObject({ score: 2, validatedDays: 2, qualified: true });
    expect(results.body.winners).toHaveLength(1);
  });
});
