import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ActivityStatus, ExerciseType, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';

import { AppModule } from '../src/app.module';
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

  it('results incluye payout: pote 600 para un ganador', async () => {
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
    expect(res.body.payout).toEqual({ pot: 600, winnersCount: 1, perWinner: 600, monetary: true });
  });

  it('un reto con presupuesto 0 reporta premio no monetario', async () => {
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
        budgetTotal: 0,
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
