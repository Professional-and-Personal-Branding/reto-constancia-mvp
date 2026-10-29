import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Sesión efectiva y último administrador (specs session-validity y user-administration).
 * App propia (cubetas del limitador vacías). Usuarios `e2e-session-*` y reto del año 2097,
 * limpiados al inicio y al final. Presupuesto: 4 logins.
 *
 * Los casos del último admin necesitan que los admin de la prueba sean los únicos activos:
 * `beforeAll` desactiva a los demás (el admin del seed incluido) y `afterAll` reactiva
 * exactamente esos ids en un `finally`. Si el proceso muere entre ambos, el admin del seed queda
 * inactivo solo en la base local: corre `npx prisma migrate reset --force` en `backend/`.
 */
describe('Sesión efectiva y último administrador (e2e)', () => {
  let app: INestApplication;
  let http: import('http').Server;
  let prisma: PrismaService;

  const YEAR = 2097;
  const password = 'Secret123';
  const email = {
    a: 'e2e-session-a@reto.local',
    b: 'e2e-session-b@reto.local',
    p1: 'e2e-session-p1@reto.local',
    p2: 'e2e-session-p2@reto.local',
  };
  const id = { a: '', b: '', p1: '', p2: '' };
  const token = { a: '', b: '', p1: '', p2: '' };
  let refreshP1 = '';
  let otherAdminIds: string[] = [];

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const patchUser = (as: string, target: string, body: Record<string, unknown>) =>
    request(http).patch(`/api/users/${target}`).set(auth(as)).send(body);
  const setUser = (key: keyof typeof id, data: { role?: UserRole; active?: boolean }) =>
    prisma.user.update({ where: { id: id[key] }, data });
  const activeAdminsOfTest = async () =>
    prisma.user.count({ where: { id: { in: [id.a, id.b] }, role: UserRole.ADMIN, active: true } });

  async function cleanup() {
    await prisma.challenge.deleteMany({ where: { year: YEAR } });
    await prisma.user.deleteMany({ where: { email: { startsWith: 'e2e-session-' } } });
  }

  async function login(addr: string) {
    const res = await request(http).post('/api/auth/login').send({ email: addr, password });
    expect(res.status).toBe(200);
    return res.body.tokens as { accessToken: string; refreshToken: string };
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
    const make = async (key: keyof typeof id, role: UserRole) => {
      const u = await prisma.user.create({
        data: { email: email[key], name: `E2E Session ${key}`, passwordHash, role },
      });
      id[key] = u.id;
    };
    await make('a', UserRole.ADMIN);
    await make('b', UserRole.ADMIN);
    await make('p1', UserRole.PARTICIPANT);
    await make('p2', UserRole.PARTICIPANT);

    // Registrar y desactivar a los demás admin activos (se reactivan en afterAll).
    const others = await prisma.user.findMany({
      where: { role: UserRole.ADMIN, active: true, id: { notIn: [id.a, id.b] } },
      select: { id: true },
    });
    otherAdminIds = others.map((o) => o.id);
    await prisma.user.updateMany({ where: { id: { in: otherAdminIds } }, data: { active: false } });

    token.a = (await login(email.a)).accessToken;
    token.b = (await login(email.b)).accessToken;
    const p1 = await login(email.p1);
    token.p1 = p1.accessToken;
    refreshP1 = p1.refreshToken;
    token.p2 = (await login(email.p2)).accessToken;
  });

  afterAll(async () => {
    try {
      await cleanup();
    } finally {
      try {
        if (otherAdminIds.length) {
          await prisma.user.updateMany({ where: { id: { in: otherAdminIds } }, data: { active: true } });
        }
      } finally {
        await app?.close();
      }
    }
  });

  it('SESSION: un usuario desactivado con access token vivo recibe 401 en cualquier ruta y no puede renovar', async () => {
    const before = await request(http).get('/api/challenges/active/list').set(auth(token.p1));
    expect(before.status).toBe(200);

    const off = await patchUser(token.a, id.p1, { active: false });
    expect(off.status).toBe(200);

    for (const path of ['/api/challenges/active/list', '/api/auth/me', '/api/users/me']) {
      const res = await request(http).get(path).set(auth(token.p1));
      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Sesión no válida');
    }
    const refresh = await request(http).post('/api/auth/refresh').send({ refreshToken: refreshP1 });
    expect(refresh.status).toBe(401);
  });

  it('SESSION: un usuario reactivado vuelve a usar su access token', async () => {
    const on = await patchUser(token.a, id.p1, { active: true });
    expect(on.status).toBe(200);
    const res = await request(http).get('/api/challenges/active/list').set(auth(token.p1));
    expect(res.status).toBe(200);
  });

  it('SESSION: un admin degradado con access token vivo recibe 403 en rutas de admin y el ranking sin emails', async () => {
    const created = await request(http)
      .post('/api/challenges')
      .set(auth(token.b))
      .send({
        name: 'E2E Sesión',
        month: 1,
        year: YEAR,
        startDate: `${YEAR}-01-01T00:00:00.000Z`,
        endDate: `${YEAR}-01-31T23:59:59.000Z`,
        validDays: [0, 1, 2, 3, 4, 5, 6],
        minHeartRateMinutes: 0,
        feePerParticipant: 10,
        budgetTotal: 100,
        currency: 'BOB',
      });
    expect(created.status).toBe(201);
    const challengeId = created.body.id as string;
    await request(http).post(`/api/challenges/${challengeId}/activate`).set(auth(token.b));
    for (const userId of [id.a, id.p1]) {
      const add = await request(http)
        .post(`/api/challenges/${challengeId}/participants`)
        .set(auth(token.b))
        .send({ userId });
      expect(add.status).toBe(201);
    }

    const asAdmin = await request(http).get(`/api/challenges/${challengeId}/results`).set(auth(token.a));
    expect(asAdmin.status).toBe(200);
    expect(asAdmin.body.ranking.find((r: { userId: string }) => r.userId === id.p1)).toHaveProperty('email');

    const demote = await patchUser(token.b, id.a, { role: 'PARTICIPANT' });
    expect(demote.status).toBe(200);

    const users = await request(http).get('/api/users').set(auth(token.a));
    expect(users.status).toBe(403);
    expect(users.body.message).toBe('No tienes permiso para esta acción');

    const results = await request(http).get(`/api/challenges/${challengeId}/results`).set(auth(token.a));
    expect(results.status).toBe(200);
    expect(results.body.ranking.map((r: { userId: string }) => r.userId)).toContain(id.p1);
    for (const row of results.body.ranking) {
      expect(row).not.toHaveProperty('email');
      expect(row).not.toHaveProperty('paid');
    }

    await setUser('a', { role: UserRole.ADMIN });
  });

  it('SESSION: un participante promovido usa rutas de admin sin volver a iniciar sesión', async () => {
    const before = await request(http).get('/api/users').set(auth(token.p2));
    expect(before.status).toBe(403);
    const promote = await patchUser(token.a, id.p2, { role: 'ADMIN' });
    expect(promote.status).toBe(200);
    const after = await request(http).get('/api/users').set(auth(token.p2));
    expect(after.status).toBe(200);
    await setUser('p2', { role: UserRole.PARTICIPANT });
  });

  it('ADMINS: nadie puede desactivar su propia cuenta', async () => {
    const res = await patchUser(token.a, id.a, { active: false });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('No puedes desactivar tu propia cuenta');
    expect((await prisma.user.findUnique({ where: { id: id.a } }))?.active).toBe(true);

    // También el último admin activo: el mensaje de la cuenta propia va primero.
    await setUser('b', { active: false });
    const last = await patchUser(token.a, id.a, { active: false });
    expect(last.status).toBe(400);
    expect(last.body.message).toBe('No puedes desactivar tu propia cuenta');
    await setUser('b', { active: true });
  });

  it('ADMINS: el último admin activo no puede quitarse el rol', async () => {
    await setUser('b', { active: false });
    const res = await patchUser(token.a, id.a, { role: 'PARTICIPANT' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('No puedes quitar el rol de administrador al último administrador activo');
    expect((await prisma.user.findUnique({ where: { id: id.a } }))?.role).toBe(UserRole.ADMIN);

    // Cambiar el nombre y reactivar al otro admin siguen permitidos.
    const rename = await patchUser(token.a, id.a, { name: 'Admin Principal' });
    expect(rename.status).toBe(200);
    expect(rename.body.name).toBe('Admin Principal');
    const reactivate = await patchUser(token.a, id.b, { active: true });
    expect(reactivate.status).toBe(200);
  });

  it('ADMINS: con dos admins activos se puede degradar a uno', async () => {
    const res = await patchUser(token.a, id.b, { role: 'PARTICIPANT' });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('PARTICIPANT');
    await setUser('b', { role: UserRole.ADMIN });
  });

  it('ADMINS: dos admins que se degradan a la vez dejan exactamente un admin activo', async () => {
    const [r1, r2] = await Promise.all([
      patchUser(token.a, id.b, { role: 'PARTICIPANT' }),
      patchUser(token.b, id.a, { role: 'PARTICIPANT' }),
    ]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses[0]).toBe(200);
    expect([400, 403]).toContain(statuses[1]);
    const loser = r1.status === 200 ? r2 : r1;
    if (loser.status === 400) {
      expect(loser.body.message).toBe('No puedes quitar el rol de administrador al último administrador activo');
    }
    expect(await activeAdminsOfTest()).toBe(1);
    await setUser('a', { role: UserRole.ADMIN });
    await setUser('b', { role: UserRole.ADMIN });
  });

  it('ADMINS: dos admins que se desactivan a la vez dejan exactamente un admin activo', async () => {
    const [r1, r2] = await Promise.all([
      patchUser(token.a, id.b, { active: false }),
      patchUser(token.b, id.a, { active: false }),
    ]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses[0]).toBe(200);
    expect([400, 401]).toContain(statuses[1]);
    const loser = r1.status === 200 ? r2 : r1;
    if (loser.status === 400) {
      expect(loser.body.message).toBe('No puedes desactivar al último administrador activo');
    }
    expect(await activeAdminsOfTest()).toBe(1);
  });
});
