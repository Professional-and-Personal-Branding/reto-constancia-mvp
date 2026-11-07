import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { UserRole } from '@prisma/client';

import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/auth/password-hash';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * E2E del flujo principal. Requiere una base Postgres accesible vía DATABASE_URL
 * con las migraciones aplicadas (`npx prisma migrate deploy`).
 * En CI se levanta un servicio Postgres antes de correr estas pruebas.
 */
describe('Flujo principal (e2e)', () => {
  let app: INestApplication;
  let http: import('http').Server;
  let prisma: PrismaService;

  const email = `e2e+${Date.now()}@reto.local`;
  const password = 'Secret123';
  let accessToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /api/health responde ok', async () => {
    const res = await request(http).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /api/health/db verifica la conexión', async () => {
    const res = await request(http).get('/api/health/db');
    expect(res.status).toBe(200);
    expect(res.body.db).toBe('up');
  });

  it('POST /api/auth/register crea participante', async () => {
    const res = await request(http)
      .post('/api/auth/register')
      .send({ email, name: 'E2E User', password });
    expect(res.status).toBe(201);
    expect(res.body.tokens.accessToken).toBeDefined();
    expect(res.body.user.passwordHash).toBeUndefined();
    accessToken = res.body.tokens.accessToken;
  });

  it('GET /api/auth/me devuelve el perfil autenticado', async () => {
    const res = await request(http)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('PARTICIPANT');
    expect(res.body.passwordHash).toBeUndefined();
  });

  it('POST /api/auth/login con credenciales correctas', async () => {
    const res = await request(http)
      .post('/api/auth/login')
      .send({ email, password });
    expect(res.status).toBe(200);
    expect(res.body.tokens.accessToken).toBeDefined();
  });

  it('POST /api/auth/login con password incorrecto -> 401', async () => {
    const res = await request(http)
      .post('/api/auth/login')
      .send({ email, password: 'incorrecto1' });
    expect(res.status).toBe(401);
  });

  it('el login responde igual con email inexistente, usuario inactivo o contraseña incorrecta', async () => {
    // Este archivo usa 5 de los 5 logins por minuto de la IP: no agregar más logins aquí.
    const inactiveEmail = `e2e-timing-${Date.now()}@reto.local`;
    const inactive = await prisma.user.create({
      data: { email: inactiveEmail, name: 'E2E Timing', passwordHash: await hashPassword(password), role: UserRole.PARTICIPANT },
    });
    await prisma.user.update({ where: { id: inactive.id }, data: { active: false } });
    try {
      const unknown = await request(http)
        .post('/api/auth/login')
        .send({ email: `e2e-timing-nadie-${Date.now()}@reto.local`, password });
      const deactivated = await request(http)
        .post('/api/auth/login')
        .send({ email: inactiveEmail, password });
      const wrong = await request(http)
        .post('/api/auth/login')
        .send({ email, password: 'incorrecto1' });
      for (const res of [unknown, deactivated, wrong]) {
        expect(res.status).toBe(401);
        expect(res.body).toEqual(wrong.body);
      }
      expect(wrong.body.message).toBe('Credenciales inválidas');
    } finally {
      await prisma.user.delete({ where: { id: inactive.id } });
    }
  });

  it('participante no puede crear retos (RBAC 403)', async () => {
    const res = await request(http)
      .post('/api/challenges')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Reto test',
        month: 1,
        year: 2030,
        startDate: '2030-01-01T00:00:00.000Z',
        endDate: '2030-01-31T00:00:00.000Z',
      });
    expect(res.status).toBe(403);
  });

  it('importación es solo para admin (403 a participante)', async () => {
    const res = await request(http)
      .get('/api/import/template')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
  });

  it('rechaza acceso sin token (401)', async () => {
    const res = await request(http).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});
