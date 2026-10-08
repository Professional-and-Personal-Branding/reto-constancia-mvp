import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ActivityStatus, ExerciseType, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Acta del reto cerrado en CSV (cambio challenge-export-csv).
 * Datos propios en el año 2095 y usuarios `e2e-exp-*`, limpiados al inicio y al final.
 * Dos logins (admin y un participante); actividades y pagos se siembran directo en la base.
 */
describe('Acta del reto cerrado en CSV (e2e)', () => {
  let app: INestApplication;
  let http: import('http').Server;
  let prisma: PrismaService;
  let admin = '';
  let participant = '';
  let closedId = '';

  const YEAR = 2095;
  const userId: Record<string, string> = {};
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const exportOf = (id: string, token = admin, query = '?format=csv') =>
    request(http).get(`/api/challenges/${id}/export${query}`).set(auth(token)).buffer(true).parse((res, cb) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => cb(null, data));
    });

  async function cleanup() {
    await prisma.challenge.deleteMany({ where: { year: YEAR } });
    await prisma.user.deleteMany({ where: { email: { startsWith: 'e2e-exp-' } } });
  }

  async function newChallenge(month: number, extra: Record<string, unknown> = {}) {
    const pad = String(month).padStart(2, '0');
    const created = await request(http).post('/api/challenges').set(auth(admin)).send({
      name: `E2E Acta ${month}`, month, year: YEAR,
      startDate: `${YEAR}-${pad}-01T00:00:00.000Z`, endDate: `${YEAR}-${pad}-28T23:59:59.000Z`,
      validDays: [0, 1, 2, 3, 4, 5, 6], minHeartRateMinutes: 0, ...extra,
    });
    expect(created.status).toBe(201);
    return created.body.id as string;
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

    const passwordHash = await argon2.hash('Secret123');
    await prisma.user.create({ data: { email: 'e2e-exp-admin@reto.local', name: 'Admin', passwordHash, role: UserRole.ADMIN } });
    const people: [string, string][] = [['ana', 'Ana Pérez'], ['beto', '=Beto, Jr'], ['carla', 'Carla']];
    for (const [key, name] of people) {
      const u = await prisma.user.create({
        data: { email: `e2e-exp-${key}@reto.local`, name, passwordHash, role: UserRole.PARTICIPANT },
      });
      userId[key] = u.id;
    }
    const login = async (email: string) =>
      (await request(http).post('/api/auth/login').send({ email, password: 'Secret123' })).body.tokens.accessToken as string;
    admin = await login('e2e-exp-admin@reto.local');
    participant = await login('e2e-exp-ana@reto.local');

    // Reto cerrado: Ana 3 días (paga completo), Beto 2 (parcial), Carla 1 (no pagó); Ana se premia
    closedId = await newChallenge(1, { feePerParticipant: 100, maxWinners: 1 });
    expect((await request(http).post(`/api/challenges/${closedId}/activate`).set(auth(admin))).status).toBe(201);
    const days: [string, number, boolean, number | null][] = [['ana', 3, true, 100], ['beto', 2, true, 40], ['carla', 1, false, null]];
    for (const [key, count, paid, amount] of days) {
      await prisma.challengeParticipant.create({
        data: {
          challengeId: closedId, userId: userId[key], paid, amountPaid: amount,
          paidAt: paid ? new Date(`${YEAR}-01-10T12:00:00.000Z`) : null,
          paymentProofUrl: `https://files.example/proof-${key}.pdf`, paymentProofCloudinaryId: `reto-constancia/proof-${key}`,
        },
      });
      for (let d = 0; d < count; d++) {
        await prisma.dailyActivity.create({
          data: {
            challengeId: closedId, userId: userId[key], date: new Date(`${YEAR}-01-0${d + 2}T00:00:00.000Z`),
            exerciseType: ExerciseType.RUNNING, durationMinutes: 30, distanceKm: 5, status: ActivityStatus.VALIDATED,
          },
        });
      }
    }
    expect((await request(http).post(`/api/challenges/${closedId}/close`).set(auth(admin))).status).toBe(201);
    expect(
      (await request(http).post(`/api/challenges/${closedId}/awards`).set(auth(admin)).send({ userIds: [userId.ana], notes: 'Premio entregado' })).status,
    ).toBe(201);
  });

  afterAll(async () => {
    await cleanup();
    await app?.close();
  });

  it('EXPORT: un participante recibe 403 y sin sesión 401', async () => {
    expect((await exportOf(closedId, participant)).status).toBe(403);
    expect((await request(http).get(`/api/challenges/${closedId}/export`)).status).toBe(401);
  });

  it('EXPORT: un reto activo o en borrador responde 400, un formato desconocido 400 y uno inexistente 404', async () => {
    const draft = await newChallenge(2);
    const active = await newChallenge(3);
    await request(http).post(`/api/challenges/${active}/activate`).set(auth(admin));
    for (const id of [draft, active]) {
      const res = await exportOf(id);
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain('Solo se puede exportar el acta de un reto cerrado');
    }
    expect((await exportOf(closedId, admin, '?format=xlsx')).status).toBe(400);
    expect((await exportOf('00000000-0000-4000-8000-000000000000')).status).toBe(404);
  });

  it('EXPORT: el reto cerrado se descarga como CSV con BOM, cabecera y una fila por participante en orden de ranking', async () => {
    const res = await exportOf(closedId);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toBe('attachment; filename="acta-reto-2095-01.csv"');
    const body = res.body as string;
    expect(body.charCodeAt(0)).toBe(0xfeff);
    const rows = body.slice(1).split('\r\n');
    expect(rows.pop()).toBe('');
    expect(rows[0].startsWith('reto,periodo,moneda,cuota,pote,posicion,nombre,email,dias_validados')).toBe(true);
    expect(rows).toHaveLength(4);
    expect(rows[1]).toContain(',1,Ana Pérez,e2e-exp-ana@reto.local,3,0,0,15.00,3,si,pagado,100.00,2095-01-10,');
    expect(rows[2]).toContain(',2,"\'=Beto, Jr",e2e-exp-beto@reto.local,2,');
    expect(rows[3]).toContain(',3,Carla,e2e-exp-carla@reto.local,1,');
  });

  it('EXPORT: el pago, la premiación guardada y el premio salen de lo que muestra la plataforma', async () => {
    const rows = ((await exportOf(closedId)).body as string).slice(1).split('\r\n');
    // Pote = lo recaudado (100 + 40); el único premiado se lleva todo
    expect(rows[1]).toContain('E2E Acta 1,2095-01,BOB,100.00,140.00,1,');
    expect(rows[1].endsWith(',si,Premio entregado,140.00')).toBe(true);
    expect(rows[2]).toContain(',parcial,40.00,2095-01-10,no,,');
    expect(rows[3]).toContain(',pendiente,0.00,,no,,');
  });

  it('EXPORT: no incluye enlaces de comprobantes y no cambia ningún dato del reto', async () => {
    const snapshot = async () =>
      JSON.stringify({
        challenge: await prisma.challenge.findUnique({ where: { id: closedId } }),
        participants: await prisma.challengeParticipant.findMany({ where: { challengeId: closedId }, orderBy: { userId: 'asc' } }),
        awards: await prisma.challengeAward.findMany({ where: { challengeId: closedId }, orderBy: { userId: 'asc' } }),
        activities: await prisma.dailyActivity.count({ where: { challengeId: closedId } }),
      });
    const before = await snapshot();
    const body = (await exportOf(closedId)).body as string;
    expect(body).not.toContain('files.example');
    expect(body).not.toContain('proof-');
    expect(await snapshot()).toBe(before);
  });

  it('EXPORT: un reto cerrado sin participantes entrega solo la cabecera', async () => {
    const empty = await newChallenge(4);
    await request(http).post(`/api/challenges/${empty}/activate`).set(auth(admin));
    expect((await request(http).post(`/api/challenges/${empty}/close`).set(auth(admin))).status).toBe(201);
    const res = await exportOf(empty);
    expect(res.status).toBe(200);
    expect(((res.body as string).slice(1)).split('\r\n').filter(Boolean)).toHaveLength(1);
  });
});
