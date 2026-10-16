import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ownedAsset } from './helpers/assets';

/**
 * E2E del calendario propio (OpenSpec: participant-my-month-calendar, spec participant-calendar).
 * Datos propios (octubre de 2093, usuarios `e2e-cal-*`), limpiados al inicio y al final.
 * Octubre de 2093 empieza en jueves; con validDays = [1..6] los domingos son descanso.
 */
describe('Calendario del participante: GET /activities/me/calendar (e2e)', () => {
  let app: INestApplication;
  let http: import('http').Server;
  let prisma: PrismaService;

  const YEAR = 2093;
  const password = 'Secret123';
  const emails = {
    admin: 'e2e-cal-admin@reto.local',
    ana: 'e2e-cal-ana@reto.local',
    beto: 'e2e-cal-beto@reto.local',
    carla: 'e2e-cal-carla@reto.local', // no inscrita
  };

  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  let challengeId: string;
  let closedId: string;
  const activityIds: Record<string, string> = {};

  const auth = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
  const dayOf = (day: number) => `${YEAR}-10-${String(day).padStart(2, '0')}`;
  const calendarUrl = (id: string) => `/api/activities/me/calendar?challengeId=${id}`;

  function body(cid: string, userId: string, date: string) {
    return {
      challengeId: cid,
      date,
      exerciseType: 'RUNNING',
      durationMinutes: 40,
      photos: [{ ...ownedAsset({ challengeId: cid, userId, name: `cal-${date}` }), type: 'ACTIVITY' }],
    };
  }

  async function login(email: string): Promise<string> {
    const res = await request(http).post('/api/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    return res.body.tokens.accessToken as string;
  }

  async function register(who: 'ana' | 'beto', cid: string, date: string) {
    const res = await request(http)
      .post('/api/activities')
      .set(auth(who))
      .send(body(cid, ids[who], date));
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  async function cleanup() {
    await prisma.challenge.deleteMany({ where: { year: YEAR } });
    await prisma.user.deleteMany({ where: { email: { startsWith: 'e2e-cal-' } } });
  }

  async function newChallenge(month: number, name: string) {
    const lastDay = new Date(Date.UTC(YEAR, month, 0)).getUTCDate();
    const res = await request(http)
      .post('/api/challenges')
      .set(auth('admin'))
      .send({
        name,
        month,
        year: YEAR,
        validDays: [1, 2, 3, 4, 5, 6],
        startDate: `${YEAR}-${String(month).padStart(2, '0')}-01T00:00:00.000Z`,
        endDate: `${YEAR}-${String(month).padStart(2, '0')}-${lastDay}T23:59:59.000Z`,
        feePerParticipant: 0,
        budgetTotal: 0,
        minHeartRateMinutes: 0,
      });
    expect(res.status).toBe(201);
    const id = res.body.id as string;
    expect((await request(http).post(`/api/challenges/${id}/activate`).set(auth('admin'))).status).toBe(201);
    for (const who of ['ana', 'beto']) {
      const joined = await request(http)
        .post(`/api/challenges/${id}/participants`)
        .set(auth('admin'))
        .send({ userId: ids[who] });
      expect(joined.status).toBe(201);
    }
    return id;
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
    const roles: Record<string, UserRole> = {
      admin: UserRole.ADMIN,
      ana: UserRole.PARTICIPANT,
      beto: UserRole.PARTICIPANT,
      carla: UserRole.PARTICIPANT,
    };
    for (const [key, email] of Object.entries(emails)) {
      const user = await prisma.user.create({
        data: { email, name: `E2E Cal ${key}`, passwordHash, role: roles[key] },
      });
      ids[key] = user.id;
    }
    for (const key of Object.keys(emails)) tokens[key] = await login(emails[key as keyof typeof emails]);

    challengeId = await newChallenge(10, 'E2E Calendario');
  });

  afterAll(async () => {
    await cleanup();
    await app?.close();
  });

  it('arma el mes de 31 días con actividad validada, pendiente y rechazada, y el descanso', async () => {
    activityIds.validated = await register('ana', challengeId, dayOf(6));
    activityIds.pending = await register('ana', challengeId, dayOf(7));
    activityIds.rejected = await register('ana', challengeId, dayOf(8));
    expect(
      (await request(http).post(`/api/activities/${activityIds.validated}/validate`).set(auth('admin')).send({}))
        .status,
    ).toBe(201);
    expect(
      (
        await request(http)
          .post(`/api/activities/${activityIds.rejected}/reject`)
          .set(auth('admin'))
          .send({ reason: 'Foto borrosa' })
      ).status,
    ).toBe(201);

    const res = await request(http).get(calendarUrl(challengeId)).set(auth('ana'));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      challengeId,
      status: 'ACTIVE',
      startDate: dayOf(1),
      endDate: dayOf(31),
      validDays: [1, 2, 3, 4, 5, 6],
    });
    expect(res.body.days).toHaveLength(31);
    expect(res.body.days[0].date).toBe(dayOf(1));
    expect(res.body.days[30].date).toBe(dayOf(31));

    const byDate = (d: number) => res.body.days[d - 1];
    // 2093-10-04 es domingo: descanso
    expect(new Date(`${dayOf(4)}T00:00:00Z`).getUTCDay()).toBe(0);
    expect(byDate(4)).toEqual({ date: dayOf(4), valid: false, activity: null });
    expect(byDate(5).valid).toBe(true);
    expect(byDate(5).activity).toBeNull();

    expect(byDate(6).activity).toMatchObject({
      id: activityIds.validated,
      status: 'VALIDATED',
      exerciseType: 'RUNNING',
      durationMinutes: 40,
      heartRateCompliant: true,
      rejectionReason: null,
    });
    expect(byDate(7).activity.status).toBe('PENDING');
    expect(byDate(8).activity).toMatchObject({ status: 'REJECTED', rejectionReason: 'Foto borrosa' });

    // Los domingos de octubre de 2093 son 4, 11, 18, 25: 31 - 4 = 27 días válidos
    expect(res.body.summary).toEqual({ validDaysTotal: 27, registered: 3, validated: 1, pending: 1, rejected: 1 });
    expect(JSON.stringify(res.body)).not.toMatch(/photos|cloudinary|"user"|validatedBy|email/i);
  });

  it('un día valid:true lo acepta POST /activities y uno valid:false dentro del período recibe el 400 de día de la semana', async () => {
    const cal = await request(http).get(calendarUrl(challengeId)).set(auth('ana'));
    const open = cal.body.days.find((d: { valid: boolean; activity: unknown }) => d.valid && !d.activity);
    const rest = cal.body.days.find((d: { valid: boolean }) => !d.valid);
    expect(open).toBeDefined();
    expect(rest).toBeDefined();

    const ok = await request(http)
      .post('/api/activities')
      .set(auth('ana'))
      .send(body(challengeId, ids.ana, open.date));
    expect(ok.status).toBe(201);

    const bad = await request(http)
      .post('/api/activities')
      .set(auth('ana'))
      .send(body(challengeId, ids.ana, rest.date));
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.body.message)).toMatch(/Ese día de la semana no es válido para este reto/);

    // El calendario refleja el registro nuevo
    const after = await request(http).get(calendarUrl(challengeId)).set(auth('ana'));
    expect(after.body.summary.registered).toBe(4);
  });

  it('dos participantes el mismo día ven solo lo propio', async () => {
    const betoId = await register('beto', challengeId, dayOf(6));
    const ana = await request(http).get(calendarUrl(challengeId)).set(auth('ana'));
    const beto = await request(http).get(calendarUrl(challengeId)).set(auth('beto'));
    expect(ana.body.days[5].activity.id).toBe(activityIds.validated);
    expect(beto.body.days[5].activity.id).toBe(betoId);
    expect(JSON.stringify(ana.body)).not.toContain(betoId);
    expect(beto.body.summary.registered).toBe(1);
    expect(beto.body.days[6].activity).toBeNull(); // el pendiente del 7 es de Ana
  });

  it('400 sin challengeId o con uno que no es UUID', async () => {
    expect((await request(http).get('/api/activities/me/calendar').set(auth('ana'))).status).toBe(400);
    expect((await request(http).get(calendarUrl('no-es-uuid')).set(auth('ana'))).status).toBe(400);
  });

  it('404 si el reto no existe', async () => {
    const res = await request(http).get(calendarUrl('00000000-0000-4000-8000-000000000000')).set(auth('ana'));
    expect(res.status).toBe(404);
  });

  it('403 "No participas en este reto" para quien no está inscrito', async () => {
    const res = await request(http).get(calendarUrl(challengeId)).set(auth('carla'));
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('No participas en este reto');
  });

  it('userId en la query se rechaza con 400 y no devuelve calendario', async () => {
    const res = await request(http)
      .get(`${calendarUrl(challengeId)}&userId=${ids.beto}`)
      .set(auth('ana'));
    expect(res.status).toBe(400);
    expect(res.body.days).toBeUndefined();
  });

  it('exige sesión', async () => {
    expect((await request(http).get(calendarUrl(challengeId))).status).toBe(401);
  });

  it('un reto COMPLETED sigue respondiendo 200 con los mismos días y actividades', async () => {
    closedId = await newChallenge(11, 'E2E Calendario cerrado');
    const id = await register('ana', closedId, `${YEAR}-11-03`);
    const before = await request(http).get(calendarUrl(closedId)).set(auth('ana'));
    expect(before.status).toBe(200);
    expect(before.body.days).toHaveLength(30);

    await prisma.challenge.update({ where: { id: closedId }, data: { status: 'COMPLETED' } });
    const after = await request(http).get(calendarUrl(closedId)).set(auth('ana'));
    expect(after.status).toBe(200);
    expect(after.body.status).toBe('COMPLETED');
    expect(after.body.days).toEqual(before.body.days);
    expect(after.body.days[2].activity.id).toBe(id);
  });
});
