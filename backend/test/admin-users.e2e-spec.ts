import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { applyRequestContext } from '../src/common/request-context';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Reinicio de contraseña por el admin (spec user-administration). App propia: sus cubetas del
 * limitador empiezan vacías. Presupuesto de reinicios: 5 antes del límite (1 + 1 + 1 + 2) y el
 * sexto responde 429; logins: 5. Usuarios `e2e-adminusers-*`, limpiados al inicio y al final.
 */
describe('Administración de usuarios: reinicio de contraseña (e2e)', () => {
  let app: INestApplication;
  let http: import('http').Server;
  let prisma: PrismaService;

  const password = 'Secret123';
  const email = {
    admin: 'e2e-adminusers-admin@reto.local',
    ana: 'e2e-adminusers-ana@reto.local',
    bruno: 'e2e-adminusers-bruno@reto.local',
  };
  const id = { admin: '', ana: '', bruno: '' };
  let adminToken = '';
  let bruno = '';
  let anaRefreshBefore = '';
  let temporaryPassword = '';

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const reset = (as: string, target: string) => request(http).post(`/api/users/${target}/reset-password`).set(auth(as));
  const login = (addr: string, pass: string) =>
    request(http).post('/api/auth/login').send({ email: addr, password: pass });
  const hashOf = async (userId: string) =>
    (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).passwordHash;

  async function cleanup() {
    await prisma.user.deleteMany({ where: { email: { startsWith: 'e2e-adminusers-' } } });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    applyRequestContext(app);
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
        data: { email: email[key], name: `E2E AdminUsers ${key}`, passwordHash, role },
      });
      id[key] = u.id;
    };
    await make('admin', UserRole.ADMIN);
    await make('ana', UserRole.PARTICIPANT);
    await make('bruno', UserRole.PARTICIPANT);

    const a = await login(email.admin, password);
    expect(a.status).toBe(200);
    adminToken = a.body.tokens.accessToken;
    const b = await login(email.bruno, password);
    expect(b.status).toBe(200);
    bruno = b.body.tokens.accessToken;
    // Sesión abierta de Ana antes del reinicio (se prueba con el refresh token).
    const ana = await login(email.ana, password);
    expect(ana.status).toBe(200);
    anaRefreshBefore = ana.body.tokens.refreshToken;
  });

  afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await app?.close();
    }
  });

  it('RESET: el admin recibe una contraseña temporal una sola vez, sin caché, y la vieja deja de servir', async () => {
    const log = jest.spyOn(Logger.prototype, 'log');
    const before = await hashOf(id.ana);
    let res: request.Response;
    try {
      res = await reset(adminToken, id.ana).set('X-Request-Id', 'e2e-reset-1');
      expect(res.status).toBe(200);
      expect(Object.keys(res.body)).toEqual(['temporaryPassword']);
      temporaryPassword = res.body.temporaryPassword;
      expect(temporaryPassword).toMatch(/^[A-HJ-NP-Za-km-np-z2-9]{4}(-[A-HJ-NP-Za-km-np-z2-9]{4}){2}$/);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['pragma']).toBe('no-cache');

      // La contraseña temporal nunca llega a un log; la línea de auditoría sí identifica el hecho.
      const lines = log.mock.calls.map((c) => String(c[0]));
      expect(lines.some((l) => l.includes(temporaryPassword))).toBe(false);
      const audit = lines.filter((l) => l.includes('admin_password_reset'));
      expect(audit).toHaveLength(1);
      expect(JSON.parse(audit[0])).toEqual({
        event: 'admin_password_reset',
        requestId: 'e2e-reset-1',
        actorId: id.admin,
        targetId: id.ana,
      });
    } finally {
      log.mockRestore();
    }

    const after = await hashOf(id.ana);
    expect(after).not.toBe(before);
    expect(after).not.toContain(temporaryPassword);

    const withTemp = await login(email.ana, temporaryPassword);
    expect(withTemp.status).toBe(200);
    const withOld = await login(email.ana, password);
    expect(withOld.status).toBe(401);
    expect(withOld.body.message).toBe('Credenciales inválidas');
  });

  it('RESET: el refresh token emitido antes del reinicio se rechaza', async () => {
    const res = await request(http).post('/api/auth/refresh').send({ refreshToken: anaRefreshBefore });
    expect(res.status).toBe(401);
  });

  it('RESET: un participante recibe 403 y la contraseña no cambia', async () => {
    const before = await hashOf(id.ana);
    const res = await reset(bruno, id.ana);
    expect(res.status).toBe(403);
    expect(res.body.temporaryPassword).toBeUndefined();
    expect(await hashOf(id.ana)).toBe(before);
  });

  it('RESET: el admin no puede reiniciar su propia contraseña', async () => {
    const before = await hashOf(id.admin);
    const res = await reset(adminToken, id.admin);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Para cambiar tu propia contraseña usa Mi cuenta');
    expect(await hashOf(id.admin)).toBe(before);
  });

  it('RESET: un usuario inexistente responde 404 y un cuerpo con propiedades 400', async () => {
    const missing = await reset(adminToken, '00000000-0000-4000-8000-000000000000');
    expect(missing.status).toBe(404);
    expect(missing.body.message).toBe('Usuario no encontrado');

    const before = await hashOf(id.bruno);
    const withBody = await reset(adminToken, id.bruno).send({ password: 'Elegida123' });
    expect(withBody.status).toBe(400);
    expect(await hashOf(id.bruno)).toBe(before);
  });

  it('RESET: el sexto reinicio en un minuto responde 429', async () => {
    // Los cinco anteriores (200, 403, 400, 404 y 400) ya contaron: el sexto, sea cual sea su
    // resultado, queda bloqueado y la contraseña no cambia.
    const before = await hashOf(id.bruno);
    const res = await reset(adminToken, id.bruno);
    expect(res.status).toBe(429);
    expect(await hashOf(id.bruno)).toBe(before);
  });
});
