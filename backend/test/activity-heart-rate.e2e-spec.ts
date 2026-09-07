import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ActivityStatus, ExerciseType, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * E2E de la regla de frecuencia cardíaca (OpenSpec: activity-heart-rate-compliance).
 * Datos propios (año 2099, el máximo que acepta la importación; usuarios `e2e-hr-*`),
 * limpiados al inicio y al final.
 */
describe('Regla de FC: heartRateMinutes, registro, override e import (e2e)', () => {
  let app: INestApplication;
  let http: import('http').Server;
  let prisma: PrismaService;

  const YEAR = 2099;
  const password = 'Secret123';
  const adminEmail = 'e2e-hr-admin@reto.local';
  const anaEmail = 'e2e-hr-ana@reto.local';

  let adminToken: string;
  let anaToken: string;
  let anaId: string;
  let strict: { id: string }; // minHeartRateMinutes = 30
  let lenient: { id: string }; // minHeartRateMinutes = 0

  const activityPhoto = { url: 'https://example.com/e2e/act.jpg', cloudinaryId: 'e2e/hr/act', type: 'ACTIVITY' };
  const hrPhoto = { url: 'https://example.com/e2e/hr.jpg', cloudinaryId: 'e2e/hr/hr', type: 'HEART_RATE' };

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  function body(challengeId: string, date: string, over: Record<string, unknown> = {}) {
    return {
      challengeId,
      date,
      exerciseType: 'RUNNING',
      durationMinutes: 45,
      photos: [activityPhoto, hrPhoto],
      ...over,
    };
  }

  async function login(email: string): Promise<string> {
    const res = await request(http).post('/api/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    return res.body.tokens.accessToken as string;
  }

  async function cleanup() {
    await prisma.challenge.deleteMany({ where: { year: YEAR } });
    await prisma.user.deleteMany({ where: { email: { startsWith: 'e2e-hr-' } } });
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
      data: { email: adminEmail, name: 'E2E HR Admin', passwordHash, role: UserRole.ADMIN },
    });
    const ana = await prisma.user.create({
      data: { email: anaEmail, name: 'E2E HR Ana', passwordHash, role: UserRole.PARTICIPANT },
    });
    anaId = ana.id;
    adminToken = await login(adminEmail);
    anaToken = await login(anaEmail);
  });

  afterAll(async () => {
    await cleanup();
    await app?.close();
  });

  it('admin crea un reto estricto (30 min) y uno sin regla (0) y activa ambos', async () => {
    const base = {
      validDays: [0, 1, 2, 3, 4, 5, 6],
      startDate: `${YEAR}-01-01T00:00:00.000Z`,
      endDate: `${YEAR}-01-31T23:59:59.000Z`,
      feePerParticipant: 0,
      budgetTotal: 0,
    };
    const s = await request(http)
      .post('/api/challenges')
      .set(auth(adminToken))
      .send({ ...base, name: 'E2E HR estricto', month: 1, year: YEAR, minHeartRateMinutes: 30 });
    expect(s.status).toBe(201);
    strict = s.body;

    const l = await request(http)
      .post('/api/challenges')
      .set(auth(adminToken))
      .send({ ...base, name: 'E2E HR sin regla', month: 2, year: YEAR, minHeartRateMinutes: 0 });
    expect(l.status).toBe(201);
    expect(l.body.minHeartRateMinutes).toBe(0);
    lenient = l.body;

    for (const c of [strict, lenient]) {
      expect((await request(http).post(`/api/challenges/${c.id}/activate`).set(auth(adminToken))).status).toBe(201);
      expect(
        (await request(http).post(`/api/challenges/${c.id}/participants`).set(auth(adminToken)).send({ userId: anaId }))
          .status,
      ).toBe(201);
    }
  });

  it('rechaza registro con 20 min de FC en un reto de 30 (mensaje menciona 30)', async () => {
    const res = await request(http)
      .post('/api/activities')
      .set(auth(anaToken))
      .send(body(strict.id, `${YEAR}-01-05`, { heartRateMinutes: 20 }));
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body.message)).toMatch(/30/);
    const mine = await request(http).get(`/api/activities/me?challengeId=${strict.id}`).set(auth(anaToken));
    expect(mine.body).toHaveLength(0);
  });

  it('rechaza registro sin foto HEART_RATE aunque tenga minutos suficientes', async () => {
    const res = await request(http)
      .post('/api/activities')
      .set(auth(anaToken))
      .send(body(strict.id, `${YEAR}-01-05`, { heartRateMinutes: 45, photos: [activityPhoto] }));
    expect(res.status).toBe(400);
  });

  it('rechaza registro con captura pero sin heartRateMinutes', async () => {
    const res = await request(http)
      .post('/api/activities')
      .set(auth(anaToken))
      .send(body(strict.id, `${YEAR}-01-05`));
    expect(res.status).toBe(400);
  });

  it('rechaza heartRateMinutes mayor que durationMinutes', async () => {
    const res = await request(http)
      .post('/api/activities')
      .set(auth(anaToken))
      .send(body(strict.id, `${YEAR}-01-05`, { durationMinutes: 30, heartRateMinutes: 45 }));
    expect(res.status).toBe(400);
  });

  it('registra una actividad conforme: hasHeartRateProof derivado y heartRateCompliant=true', async () => {
    const res = await request(http)
      .post('/api/activities')
      .set(auth(anaToken))
      .send(body(strict.id, `${YEAR}-01-05`, { heartRateMinutes: 35, hasHeartRateProof: false }));
    expect(res.status).toBe(201);
    expect(res.body.heartRateMinutes).toBe(35);
    expect(res.body.hasHeartRateProof).toBe(true);
    expect(res.body.heartRateCompliant).toBe(true);
  });

  it('en el reto sin regla acepta actividades sin minutos ni captura', async () => {
    const res = await request(http)
      .post('/api/activities')
      .set(auth(anaToken))
      .send(body(lenient.id, `${YEAR}-01-05`, { photos: [activityPhoto] }));
    expect(res.status).toBe(201);
    expect(res.body.hasHeartRateProof).toBe(false);
    expect(res.body.heartRateCompliant).toBe(true);
  });

  it('validar una actividad no conforme requiere override + nota', async () => {
    // Registro histórico (como los importados): pendiente, sin captura, 10 min de FC
    const pending = await prisma.dailyActivity.create({
      data: {
        challengeId: strict.id,
        userId: anaId,
        date: new Date(`${YEAR}-01-06T00:00:00.000Z`),
        exerciseType: ExerciseType.RUNNING,
        durationMinutes: 40,
        heartRateMinutes: 10,
        hasHeartRateProof: false,
        status: ActivityStatus.PENDING,
      },
    });

    const list = await request(http).get(`/api/activities/pending?challengeId=${strict.id}`).set(auth(adminToken));
    expect(list.status).toBe(200);
    expect(list.body.find((a: { id: string }) => a.id === pending.id)?.heartRateCompliant).toBe(false);

    const noBody = await request(http).post(`/api/activities/${pending.id}/validate`).set(auth(adminToken));
    expect(noBody.status).toBe(400);

    const noNote = await request(http)
      .post(`/api/activities/${pending.id}/validate`)
      .set(auth(adminToken))
      .send({ override: true });
    expect(noNote.status).toBe(400);

    const still = await prisma.dailyActivity.findUnique({ where: { id: pending.id } });
    expect(still?.status).toBe(ActivityStatus.PENDING);

    const ok = await request(http)
      .post(`/api/activities/${pending.id}/validate`)
      .set(auth(adminToken))
      .send({ override: true, note: 'Registro histórico verificado en persona' });
    expect(ok.status).toBe(201);
    expect(ok.body.status).toBe('VALIDATED');
    expect(ok.body.validationNote).toBe('Registro histórico verificado en persona');
    expect(ok.body.heartRateCompliant).toBe(false);
  });

  it('validar una actividad conforme no requiere cuerpo y deja validationNote null', async () => {
    const mine = await request(http).get(`/api/activities/me?challengeId=${strict.id}`).set(auth(anaToken));
    const compliant = mine.body.find((a: { heartRateCompliant: boolean; status: string }) => a.heartRateCompliant && a.status === 'PENDING');
    expect(compliant).toBeDefined();
    const ok = await request(http).post(`/api/activities/${compliant.id}/validate`).set(auth(adminToken));
    expect(ok.status).toBe(201);
    expect(ok.body.validationNote).toBeNull();
    expect(ok.body.heartRateCompliant).toBe(true);
  });

  it('la plantilla de importación incluye heartRateMinutes y el preview reporta warnings', async () => {
    const tpl = await request(http).get('/api/import/template?format=csv').set(auth(adminToken));
    expect(tpl.status).toBe(200);
    expect(tpl.text.split('\n')[0]).toMatch(/heartRateMinutes/);

    // Fila para el reto estricto (1/2201) sin minutos ni captura -> válida con advertencia
    const csv = [
      'email,name,challengeMonth,challengeYear,date,exerciseType,durationMinutes,distanceKm,avgHeartRate,heartRateMinutes,hasHeartRateProof,status,notes,photoUrl',
      `${anaEmail},E2E HR Ana,1,${YEAR},${YEAR}-01-10,RUNNING,40,5,140,,false,PENDING,,`,
      `${anaEmail},E2E HR Ana,1,${YEAR},${YEAR}-01-11,RUNNING,40,5,140,35,true,PENDING,,`,
    ].join('\n');
    const preview = await request(http)
      .post('/api/import/activities/preview')
      .set(auth(adminToken))
      .attach('file', Buffer.from(csv, 'utf8'), 'rows.csv');
    expect(preview.status).toBe(201);
    expect(preview.body.summary.valid).toBe(2);
    expect(preview.body.summary.invalid).toBe(0);
    expect(preview.body.summary.warnings).toBe(1);
    expect(preview.body.rows[0].warnings.join(' ')).toMatch(/30/);
    expect(preview.body.rows[1].warnings).toHaveLength(0);
  });
});
