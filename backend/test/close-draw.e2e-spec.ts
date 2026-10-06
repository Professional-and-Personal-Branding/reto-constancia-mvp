import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ActivityStatus, ExerciseType, TiebreakRule, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Paso único de cierre y sorteo guardado (cambio closed-challenge-freeze, PR 2).
 * Datos propios en el año 2096 y usuarios `e2e-draw-*`, limpiados al inicio y al final.
 * Un solo login (admin); las actividades se siembran directo en la base.
 */
describe('Cierre y sorteo guardado (e2e)', () => {
  let app: INestApplication;
  let http: import('http').Server;
  let prisma: PrismaService;
  let admin = '';

  const YEAR = 2096;
  const AUTO = 'Sorteo automático al cierre';
  const people = ['ana', 'beto', 'carla', 'dora'] as const;
  const userId: Record<string, string> = {};
  const auth = () => ({ Authorization: `Bearer ${admin}` });

  async function cleanup() {
    await prisma.challenge.deleteMany({ where: { year: YEAR } });
    await prisma.user.deleteMany({ where: { email: { startsWith: 'e2e-draw-' } } });
  }

  /** Reto activo del año de prueba con los 4 participantes y un día validado de cada uno. */
  async function tiedChallenge(month: number, rules: Record<string, unknown>, kms: Record<string, number> = {}) {
    const created = await request(http).post('/api/challenges').set(auth()).send({
      name: `E2E Sorteo ${month}`, month, year: YEAR,
      startDate: `${YEAR}-${String(month).padStart(2, '0')}-01T00:00:00.000Z`,
      endDate: `${YEAR}-${String(month).padStart(2, '0')}-28T23:59:59.000Z`,
      validDays: [0, 1, 2, 3, 4, 5, 6], minHeartRateMinutes: 0, ...rules,
    });
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    expect((await request(http).post(`/api/challenges/${id}/activate`).set(auth())).status).toBe(201);
    for (const who of people) {
      await prisma.challengeParticipant.create({ data: { challengeId: id, userId: userId[who] } });
      await prisma.dailyActivity.create({
        data: {
          challengeId: id, userId: userId[who], date: new Date(`${YEAR}-${String(month).padStart(2, '0')}-05T00:00:00.000Z`),
          exerciseType: ExerciseType.RUNNING, durationMinutes: 30, distanceKm: kms[who] ?? 5,
          status: ActivityStatus.VALIDATED,
        },
      });
    }
    return id;
  }

  const results = async (id: string) => (await request(http).get(`/api/challenges/${id}/results`).set(auth())).body;
  const winnerIds = (r: { winners: { userId: string }[] }) => r.winners.map((w) => w.userId).sort();

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

    const passwordHash = await argon2.hash('Secret123');
    await prisma.user.create({
      data: { email: 'e2e-draw-admin@reto.local', name: 'E2E Draw admin', passwordHash, role: UserRole.ADMIN },
    });
    for (const who of people) {
      const u = await prisma.user.create({
        data: { email: `e2e-draw-${who}@reto.local`, name: `E2E ${who}`, passwordHash, role: UserRole.PARTICIPANT },
      });
      userId[who] = u.id;
    }
    const login = await request(http).post('/api/auth/login').send({ email: 'e2e-draw-admin@reto.local', password: 'Secret123' });
    expect(login.status).toBe(200);
    admin = login.body.tokens.accessToken;
  });

  afterAll(async () => {
    await cleanup();
    await app?.close();
  });

  it('CLOSE: un borrador no se cierra por ninguna vía (400) y sigue en borrador', async () => {
    const created = await request(http).post('/api/challenges').set(auth()).send({
      name: 'E2E Borrador', month: 1, year: YEAR,
      startDate: `${YEAR}-01-01T00:00:00.000Z`, endDate: `${YEAR}-01-28T23:59:59.000Z`,
    });
    const id = created.body.id as string;
    await prisma.challengeParticipant.create({ data: { challengeId: id, userId: userId.ana } });
    const msg = 'Solo se puede cerrar un reto activo';
    for (const res of [
      await request(http).post(`/api/challenges/${id}/close`).set(auth()),
      await request(http).patch(`/api/challenges/${id}`).set(auth()).send({ status: 'COMPLETED' }),
      await request(http).post(`/api/challenges/${id}/awards`).set(auth()).send({ userIds: [userId.ana] }),
    ]) {
      expect(res.status).toBe(400);
      expect(res.body.message).toBe(msg);
    }
    const after = await prisma.challenge.findUnique({ where: { id } });
    expect(after?.status).toBe('DRAFT');
    expect(await prisma.challengeAward.count({ where: { challengeId: id } })).toBe(0);
  });

  it('CLOSE: un PATCH de cierre con otros campos se rechaza (400) y no cambia nada', async () => {
    const id = await tiedChallenge(2, { maxWinners: 2, tiebreakRule: TiebreakRule.DRAW });
    const res = await request(http).patch(`/api/challenges/${id}`).set(auth()).send({ status: 'COMPLETED', pointsPerKm: 5 });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Para cerrar el reto envía solo el estado');
    const after = await prisma.challenge.findUnique({ where: { id } });
    expect(after?.status).toBe('ACTIVE');
    expect(Number(after?.pointsPerKm)).toBe(0);
  });

  it('DRAW: al cerrar con empate se sortea una vez y los ganadores no cambian al releer', async () => {
    const id = await tiedChallenge(3, { maxWinners: 2, tiebreakRule: TiebreakRule.DRAW });
    expect((await results(id)).drawNeeded).toBe(true);

    const close = await request(http).post(`/api/challenges/${id}/close`).set(auth());
    expect(close.status).toBe(201);
    expect(close.body.status).toBe('COMPLETED');

    const awards = await prisma.challengeAward.findMany({ where: { challengeId: id } });
    expect(awards).toHaveLength(2);
    expect(awards.every((a) => a.notes === AUTO)).toBe(true);

    const first = await results(id);
    expect(first.drawNeeded).toBe(false);
    expect(first.notes).toContain('Ganadores definidos por sorteo automático al cierre.');
    expect(winnerIds(first)).toEqual(awards.map((a) => a.userId).sort());
    for (let i = 0; i < 10; i++) expect(winnerIds(await results(id))).toEqual(winnerIds(first));

    // Cerrar de nuevo no vuelve a sortear
    expect((await request(http).post(`/api/challenges/${id}/close`).set(auth())).status).toBe(201);
    const again = await prisma.challengeAward.findMany({ where: { challengeId: id } });
    expect(again.map((a) => a.userId).sort()).toEqual(awards.map((a) => a.userId).sort());
  });

  it('TOTAL_KM: con empate en el corte se guarda al asegurado y al sorteado', async () => {
    const id = await tiedChallenge(
      4,
      { maxWinners: 2, tiebreakRule: TiebreakRule.TOTAL_KM },
      { ana: 30, beto: 20, carla: 20, dora: 10 },
    );
    const close = await request(http).patch(`/api/challenges/${id}`).set(auth()).send({ status: 'COMPLETED' });
    expect(close.status).toBe(200);
    const awards = await prisma.challengeAward.findMany({ where: { challengeId: id } });
    const ids = awards.map((a) => a.userId);
    expect(ids).toHaveLength(2);
    expect(ids).toContain(userId.ana);
    expect([userId.beto, userId.carla]).toContain(ids.find((u) => u !== userId.ana));
  });

  it('AWARD: la premiación del admin reemplaza al sorteo automático y la nota reservada se rechaza', async () => {
    const id = await tiedChallenge(5, { maxWinners: 2, tiebreakRule: TiebreakRule.DRAW });
    await request(http).post(`/api/challenges/${id}/close`).set(auth());

    const reserved = await request(http).post(`/api/challenges/${id}/awards`).set(auth()).send({ userIds: [userId.dora], notes: ' Sorteo automático al cierre ' });
    expect(reserved.status).toBe(400);
    expect(JSON.stringify(reserved.body.message)).toContain('Esa nota está reservada para el sorteo automático');

    const award = await request(http).post(`/api/challenges/${id}/awards`).set(auth()).send({ userIds: [userId.dora], notes: 'Sorteo presencial' });
    expect(award.status).toBe(201);
    const r = await results(id);
    expect(winnerIds(r)).toEqual([userId.dora]);
    expect(r.notes).toContain('Premiación registrada por el administrador.');
    expect(r.status).toBe('COMPLETED');
  });

  it('PREVIEW: el resumen previo reúne pendientes, comprobantes por revisar, impagos y la proyección, sin cambiar nada', async () => {
    const id = await tiedChallenge(7, { maxWinners: 2, tiebreakRule: TiebreakRule.DRAW, feePerParticipant: 100 });
    await prisma.dailyActivity.create({
      data: {
        challengeId: id, userId: userId.dora, date: new Date(`${YEAR}-07-06T00:00:00.000Z`),
        exerciseType: ExerciseType.RUNNING, durationMinutes: 30, status: ActivityStatus.PENDING,
      },
    });
    await prisma.challengeParticipant.update({ where: { challengeId_userId: { challengeId: id, userId: userId.ana } }, data: { paid: true, amountPaid: 100 } });
    await prisma.challengeParticipant.update({
      where: { challengeId_userId: { challengeId: id, userId: userId.beto } },
      data: { paymentProofUrl: 'http://localhost:3000/uploads/x.pdf', paymentProofUploadedAt: new Date() },
    });

    const res = await request(http).get(`/api/challenges/${id}/close-preview`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.pendingActivities.count).toBe(1);
    expect(res.body.pendingActivities.items[0].userId).toBe(userId.dora);
    expect(res.body.proofsToReview.map((p: { userId: string }) => p.userId)).toEqual([userId.beto]);
    expect(res.body.unpaid.map((p: { userId: string }) => p.userId).sort()).toEqual([userId.beto, userId.carla, userId.dora].sort());
    expect(res.body).toMatchObject({ drawNeeded: true, drawSeats: 2, guaranteedWinners: [], currency: 'BOB' });
    expect(res.body.drawCandidates).toHaveLength(4);
    expect(res.body.payout).toMatchObject({ pot: 100, winnersCount: 2 });

    // Solo lectura: sigue activo, sin awards y la actividad pendiente intacta
    const after = await prisma.challenge.findUnique({ where: { id } });
    expect(after?.status).toBe('ACTIVE');
    expect(await prisma.challengeAward.count({ where: { challengeId: id } })).toBe(0);
  });

  it('PREVIEW: con TOTAL_KM y empate en el corte proyecta al asegurado y el cupo sorteado', async () => {
    const id = await tiedChallenge(8, { maxWinners: 2, tiebreakRule: TiebreakRule.TOTAL_KM }, { ana: 30, beto: 20, carla: 20, dora: 20 });
    const res = await request(http).get(`/api/challenges/${id}/close-preview`).set(auth());
    expect(res.body.guaranteedWinners.map((w: { userId: string }) => w.userId)).toEqual([userId.ana]);
    expect(res.body.drawCandidates).toHaveLength(3);
    expect(res.body.drawSeats).toBe(1);
    expect(res.body.payout.winnersCount).toBe(2);
  });

  it('PREVIEW: solo para retos activos (400) y solo para el admin (403)', async () => {
    const draft = await request(http).post('/api/challenges').set(auth()).send({
      name: 'E2E Borrador preview', month: 9, year: YEAR,
      startDate: `${YEAR}-09-01T00:00:00.000Z`, endDate: `${YEAR}-09-28T23:59:59.000Z`,
    });
    const draftRes = await request(http).get(`/api/challenges/${draft.body.id}/close-preview`).set(auth());
    expect(draftRes.status).toBe(400);
    expect(draftRes.body.message).toBe('Solo se puede cerrar un reto activo');

    const closedId = await tiedChallenge(10, { maxWinners: 2, tiebreakRule: TiebreakRule.SHARE_ALL });
    await request(http).post(`/api/challenges/${closedId}/close`).set(auth());
    const closedRes = await request(http).get(`/api/challenges/${closedId}/close-preview`).set(auth());
    expect(closedRes.status).toBe(400);
    expect(closedRes.body.message).toBe('El reto ya está cerrado');

    const login = await request(http).post('/api/auth/login').send({ email: 'e2e-draw-ana@reto.local', password: 'Secret123' });
    const asParticipant = await request(http).get(`/api/challenges/${closedId}/close-preview`).set({ Authorization: `Bearer ${login.body.tokens.accessToken}` });
    expect(asParticipant.status).toBe(403);
  });

  it('AWARD: premiar un reto activo lo cierra con exactamente esas awards', async () => {
    const id = await tiedChallenge(6, { maxWinners: 2, tiebreakRule: TiebreakRule.DRAW });
    const award = await request(http).post(`/api/challenges/${id}/awards`).set(auth()).send({ userIds: [userId.beto, userId.carla], notes: 'Premio entregado' });
    expect(award.status).toBe(201);
    const awards = await prisma.challengeAward.findMany({ where: { challengeId: id } });
    expect(awards.map((a) => a.userId).sort()).toEqual([userId.beto, userId.carla].sort());
    expect(awards.every((a) => a.notes === 'Premio entregado')).toBe(true);
    expect((await prisma.challenge.findUnique({ where: { id } }))?.status).toBe('COMPLETED');
  });
});
