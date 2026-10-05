import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import * as argon2 from 'argon2';
import * as http from 'node:http';
import { AddressInfo } from 'node:net';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { ChallengesService } from '../src/challenges/challenges.service';
import { applyRequestContext } from '../src/common/request-context';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Operación de la plataforma (spec platform-operations, cambio ops-observability-baseline):
 * readiness 503, X-Request-Id, línea de acceso sin secretos, 500 genérico, aborto y cierre.
 *
 * Arranca la app con applyRequestContext, como main.ts. Logins: 2 (setup y redacción),
 * por debajo del límite de 5 por minuto.
 */
describe('Operación de la plataforma (e2e)', () => {
  let app: INestApplication;
  let server: http.Server;
  let prisma: PrismaService;
  let token = '';
  let closed = false;

  const email = 'e2e-ops-user@reto.local';
  const password = 'Secret123';
  const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const lines: { level: string; text: string }[] = [];
  const logged = () => lines.map((l) => l.text).join('\n');
  const httpLines = (requestId: string) =>
    lines.filter((l) => l.text.includes(`"requestId":"${requestId}"`));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    applyRequestContext(app);
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }),
    );
    await app.listen(0);
    server = app.getHttpServer();
    prisma = app.get(PrismaService);

    await prisma.user.deleteMany({ where: { email } });
    await prisma.user.create({
      data: { email, name: 'E2E Ops', passwordHash: await argon2.hash(password), role: UserRole.PARTICIPANT },
    });
    const login = await request(server).post('/api/auth/login').send({ email, password });
    expect(login.status).toBe(200);
    token = login.body.tokens.accessToken;

    for (const level of ['log', 'warn', 'error'] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation(function (this: Logger, ...args: unknown[]) {
        lines.push({ level, text: args.map((a) => (typeof a === 'string' ? a : String(a))).join(' ') });
      });
    }
  });

  beforeEach(() => {
    lines.length = 0;
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    if (!closed) await app?.close();
    await new PrismaService().user.deleteMany({ where: { email } }).catch(() => undefined);
  });

  it('OPS: con la base caída /api/health/db responde 503 y /api/health sigue en 200', async () => {
    jest.spyOn(prisma, 'ping').mockRejectedValueOnce(new Error('down'));
    const res = await request(server).get('/api/health/db');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: 'error', db: 'down' });
    const id = res.headers['x-request-id'];
    const errors = lines.filter((l) => l.level === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0].text).toContain(`"requestId":"${id}"`);
    expect(errors[0].text).toContain('"route":"/api/health/db"');
    expect(errors[0].text).toContain('"status":503');
    expect(httpLines(id).filter((l) => l.level === 'warn')).toHaveLength(1);

    const live = await request(server).get('/api/health');
    expect(live.status).toBe(200);
    const ready = await request(server).get('/api/health/db');
    expect(ready.status).toBe(200);
    expect(ready.body.db).toBe('up');
  });

  it('OPS: X-Request-Id se reutiliza si es válido y si no se genera', async () => {
    const reused = await request(server).get('/api/health').set('X-Request-Id', 'e2e-req-1');
    expect(reused.headers['x-request-id']).toBe('e2e-req-1');
    expect(httpLines('e2e-req-1')).toHaveLength(1);
    const generated = await request(server).get('/api/health');
    expect(generated.headers['x-request-id']).toMatch(UUID_V4);
    const invalid = await request(server).get('/api/health').set('X-Request-Id', 'a b');
    expect(invalid.headers['x-request-id']).toMatch(UUID_V4);
  });

  it('OPS: la línea de acceso usa la plantilla de la ruta; las rutas inexistentes también llevan X-Request-Id', async () => {
    const res = await request(server)
      .get('/api/challenges/00000000-0000-0000-0000-000000000000?x=1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    const [line] = httpLines(res.headers['x-request-id']);
    const entry = JSON.parse(line.text);
    expect(entry).toMatchObject({ route: '/api/challenges/:id', status: 404, method: 'GET' });
    expect(entry.userId).toEqual(expect.any(String));
    expect(line.level).toBe('log');

    for (const path of ['/api/no-existe', '/fuera-del-prefijo']) {
      const missing = await request(server).get(path);
      expect(missing.status).toBe(404);
      expect(missing.headers['x-request-id']).toMatch(UUID_V4);
    }
  });

  it('OPS: la línea de acceso no contiene contraseñas, tokens ni la query', async () => {
    const res = await request(server)
      .post('/api/auth/login?token=secreto')
      .set('Authorization', 'Bearer abc.def.ghi')
      .send({ email, password });
    expect(res.status).toBe(200);
    expect(httpLines(res.headers['x-request-id'])).toHaveLength(1);
    const text = logged();
    for (const secret of [password, 'secreto', 'Bearer', 'abc.def.ghi', res.body.tokens.accessToken]) {
      expect(text).not.toContain(secret);
    }
  });

  it('OPS: un error inesperado responde el 500 genérico con el identificador y sin el detalle interno', async () => {
    jest.spyOn(app.get(ChallengesService), 'findAll').mockRejectedValueOnce(new Error('detalle interno'));
    const res = await request(server).get('/api/challenges').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(500);
    const id = res.headers['x-request-id'];
    expect(res.body.requestId).toBe(id);
    expect(res.body.message).toContain(id);
    expect(JSON.stringify(res.body)).not.toContain('detalle interno');
    const errors = lines.filter((l) => l.level === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0].text).toContain(`"requestId":"${id}"`);
    expect(errors[0].text).toContain('detalle interno'); // el stack queda en el log, no en la respuesta
  });

  it('OPS: el JSON mal formado responde 400 con X-Request-Id y sin línea ERROR', async () => {
    const res = await request(server)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":');
    expect(res.status).toBe(400);
    expect(res.headers['x-request-id']).toMatch(UUID_V4);
    expect(lines.filter((l) => l.level === 'error')).toHaveLength(0);
    expect(httpLines(res.headers['x-request-id']).filter((l) => l.level === 'warn')).toHaveLength(1);
  });

  it('OPS: una petición abortada por el cliente deja una sola línea con 499', async () => {
    let timer: NodeJS.Timeout | undefined;
    const slow = new Promise<never[]>((resolve) => {
      timer = setTimeout(() => resolve([]), 500);
    });
    jest
      .spyOn(app.get(ChallengesService), 'findAll')
      .mockImplementationOnce(() => slow as unknown as ReturnType<ChallengesService['findAll']>);
    const { port } = server.address() as AddressInfo;
    await new Promise<void>((done) => {
      const req = http.get(
        { port, path: '/api/challenges', headers: { Authorization: `Bearer ${token}`, 'X-Request-Id': 'e2e-abort-1' } },
        () => undefined,
      );
      req.on('error', () => done());
      setTimeout(() => req.destroy(), 50);
    });
    await new Promise((r) => setTimeout(r, 100));
    if (timer) clearTimeout(timer);
    const abortLines = httpLines('e2e-abort-1');
    expect(abortLines).toHaveLength(1);
    expect(JSON.parse(abortLines[0].text)).toMatchObject({ status: 499, aborted: true });
  });

  it('OPS: al cerrar la app se cierra la conexión a la base y queda registrado', async () => {
    const disconnect = jest.spyOn(prisma, '$disconnect');
    await app.close();
    closed = true;
    expect(disconnect).toHaveBeenCalled();
    expect(logged()).toContain('Conexión a la base cerrada');
  });
});
