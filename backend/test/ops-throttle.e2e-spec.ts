import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { applyRequestContext } from '../src/common/request-context';

/**
 * El límite de intentos conserva su respuesta con el filtro global (spec platform-operations).
 * App propia: su almacenamiento del limitador no se mezcla con el de las otras suites.
 */
describe('Límite de intentos con el filtro global (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    applyRequestContext(app);
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('OPS: el sexto login fallido en un minuto responde 429 con el cuerpo del limitador y X-Request-Id', async () => {
    const attempt = () =>
      request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'e2e-ops-nadie@reto.local', password: 'Incorrecta123' });
    for (let i = 0; i < 5; i++) expect((await attempt()).status).toBe(401);
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ statusCode: 429, message: 'ThrottlerException: Too Many Requests' });
    expect(blocked.headers['x-request-id']).toBeDefined();
  });

  it('UP: las firmas de subida tienen su propio límite por minuto (UPLOAD_SIGN_LIMIT)', async () => {
    // El límite se lee en cada petición; el limitador global corre antes que la sesión,
    // así que también cuentan los intentos sin token (401).
    const previous = process.env.UPLOAD_SIGN_LIMIT;
    process.env.UPLOAD_SIGN_LIMIT = '3';
    try {
      const sign = () => request(app.getHttpServer()).post('/api/upload/sign').send({});
      for (let i = 0; i < 3; i++) expect((await sign()).status).toBe(401);
      expect((await sign()).status).toBe(429);
    } finally {
      process.env.UPLOAD_SIGN_LIMIT = previous;
    }
  });
});
