import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Mi cuenta (spec account-self-service): nombre, contraseña, límite de intentos y fin de las
 * otras sesiones. App propia: sus cubetas del limitador empiezan vacías y no se mezclan con las
 * de platform-rules (que agota las de login a propósito). Presupuesto: 2 registros, 2 logins,
 * 2 renovaciones y 6 cambios de contraseña. Usuarios `e2e-account-*`, limpiados al inicio y al final.
 */
describe('Mi cuenta (e2e)', () => {
  let app: INestApplication;
  let http: import('http').Server;
  let prisma: PrismaService;

  const emailU = 'e2e-account-u@reto.local';
  const emailV = 'e2e-account-v@reto.local';
  const oldPassword = 'Actual123';
  const newPassword = 'Nuev0Pass2';

  let userId = '';
  let tokensA = { accessToken: '', refreshToken: '' };
  let tokensC = { accessToken: '', refreshToken: '' };

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const change = (token: string, currentPassword: string, next: string) =>
    request(http).patch('/api/users/me/password').set(auth(token)).send({ currentPassword, newPassword: next });

  async function cleanup() {
    await prisma.user.deleteMany({ where: { email: { startsWith: 'e2e-account-' } } });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    // Igual que main.ts: las propiedades no declaradas se rechazan con 400.
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

    const reg = await request(http)
      .post('/api/auth/register')
      .send({ name: 'Cuenta Uno', email: emailU, password: oldPassword });
    expect(reg.status).toBe(201);
    userId = reg.body.user.id;
    tokensA = reg.body.tokens;
  });

  afterAll(async () => {
    await cleanup();
    await app?.close();
  });

  it('ACCOUNT: PATCH /users/me renombra al usuario con el nombre recortado y sin passwordHash', async () => {
    const res = await request(http)
      .patch('/api/users/me')
      .set(auth(tokensA.accessToken))
      .send({ name: '  Ana María ' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Ana María');
    expect(res.body.id).toBe(userId);
    expect(res.body.role).toBe('PARTICIPANT');
    expect(res.body.passwordHash).toBeUndefined();
  });

  it('ACCOUNT: PATCH /users/me rechaza role y otras propiedades con 400 y el rol no cambia', async () => {
    const res = await request(http)
      .patch('/api/users/me')
      .set(auth(tokensA.accessToken))
      .send({ name: 'Ana', role: 'ADMIN' });
    expect(res.status).toBe(400);
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(stored.role).toBe('PARTICIPANT');
    expect(stored.name).toBe('Ana María');
  });

  it('ACCOUNT: un nombre inválido ("A", en blanco o de más de 80 caracteres) responde 400 con el mensaje', async () => {
    for (const name of ['A', '   ', 'x'.repeat(81)]) {
      const res = await request(http).patch('/api/users/me').set(auth(tokensA.accessToken)).send({ name });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body.message)).toContain('El nombre debe tener entre 2 y 80 caracteres');
    }
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(stored.name).toBe('Ana María');
  });

  it('ACCOUNT: PATCH /users/me sin sesión responde 401', async () => {
    const res = await request(http).patch('/api/users/me').send({ name: 'Ana' });
    expect(res.status).toBe(401);
  });

  it('ACCOUNT: contraseña nueva débil, igual o actual incorrecta responden 400 y no cambian nada', async () => {
    const weak = await change(tokensA.accessToken, oldPassword, 'corta1');
    expect(weak.status).toBe(400);
    expect(JSON.stringify(weak.body.message)).toContain('La contraseña debe tener al menos 8 caracteres');

    const same = await change(tokensA.accessToken, oldPassword, oldPassword);
    expect(same.status).toBe(400);
    expect(same.body.message).toBe('La nueva contraseña debe ser distinta de la actual');

    const wrong = await change(tokensA.accessToken, 'Equivocada1', newPassword);
    expect(wrong.status).toBe(400);
    expect(wrong.body.message).toBe('Contraseña actual incorrecta');
  });

  it('ACCOUNT: el cambio de contraseña devuelve tokens nuevos, cierra la otra sesión y reemplaza la clave', async () => {
    const res = await change(tokensA.accessToken, oldPassword, newPassword);
    expect(res.status).toBe(200);
    expect(typeof res.body.accessToken).toBe('string');
    expect(typeof res.body.refreshToken).toBe('string');
    tokensC = res.body;

    const old = await request(http).post('/api/auth/refresh').send({ refreshToken: tokensA.refreshToken });
    expect(old.status).toBe(401);
    expect(old.body.message).toBe('Refresh token inválido');

    const fresh = await request(http).post('/api/auth/refresh').send({ refreshToken: tokensC.refreshToken });
    expect(fresh.status).toBe(200);

    const withOld = await request(http).post('/api/auth/login').send({ email: emailU, password: oldPassword });
    expect(withOld.status).toBe(401);
    expect(withOld.body.message).toBe('Credenciales inválidas');
    const withNew = await request(http).post('/api/auth/login').send({ email: emailU, password: newPassword });
    expect(withNew.status).toBe(200);
  });

  it('ACCOUNT: el registro usa la misma regla de contraseña, con el mensaje en español', async () => {
    const res = await request(http)
      .post('/api/auth/register')
      .send({ name: 'Cuenta Dos', email: emailV, password: 'corta1' });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body.message)).toContain('La contraseña debe tener al menos 8 caracteres');
  });

  it('ACCOUNT: un usuario desactivado con access token vivo recibe 401 al cambiar la contraseña', async () => {
    // Misma app y misma IP: este intento cuenta como el cambio 5 (3 + 1 de éxito + este); el sexto es el 429.
    await prisma.user.update({ where: { id: userId }, data: { active: false } });
    const res = await change(tokensC.accessToken, newPassword, 'Otra0Clave9');
    expect(res.status).toBe(401);
    await prisma.user.update({ where: { id: userId }, data: { active: true } });
  });

  it('ACCOUNT: el sexto cambio de contraseña en un minuto responde 429 y la contraseña no cambia', async () => {
    // Llevamos 5 cambios (débil, igual, incorrecta, éxito, inactivo); este es el sexto.
    const blocked = await change(tokensC.accessToken, newPassword, 'Otra0Clave9');
    expect(blocked.status).toBe(429);
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(await argon2.verify(stored.passwordHash, newPassword)).toBe(true);
  });
});
