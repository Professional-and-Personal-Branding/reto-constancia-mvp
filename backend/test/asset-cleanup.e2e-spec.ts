import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import * as argon2 from 'argon2';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Limpieza de archivos (cambio upload-asset-cleanup), en modo local: se comprueba el disco.
 * Datos propios en el año 2097 y usuarios `e2e-clean-*`. Dos logins (admin y Ana).
 */
describe('Limpieza de archivos subidos (e2e, modo local)', () => {
  let app: INestApplication;
  let http: import('http').Server;
  let prisma: PrismaService;
  let admin = '';
  let ana = '';
  let anaId = '';
  let challengeId = '';

  const YEAR = 2097;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  /** Sube un archivo por el simulador local y devuelve la evidencia y su ruta en disco. */
  async function upload(purpose: 'activity' | 'payment-proof', name: string) {
    const folder = `reto-constancia/${challengeId}/${anaId}/${purpose}`;
    const res = await request(http).post('/api/upload/local').set(auth(ana)).field('folder', folder).attach('file', Buffer.from('x'), name);
    expect(res.status).toBe(201);
    const url = res.body.secure_url as string;
    return { url, cloudinaryId: res.body.public_id as string, path: join(process.cwd(), 'uploads', url.split('/uploads/')[1]) };
  }

  /** La limpieza corre después de responder: espera a que el archivo desaparezca. */
  async function gone(path: string, timeoutMs = 3_000) {
    const until = Date.now() + timeoutMs;
    while (existsSync(path) && Date.now() < until) await new Promise((r) => setTimeout(r, 50));
    return !existsSync(path);
  }

  const activity = (date: string, photos: { url: string; cloudinaryId: string }[]) => ({
    challengeId, date, exerciseType: 'RUNNING', durationMinutes: 30,
    photos: photos.map((p) => ({ url: p.url, cloudinaryId: p.cloudinaryId, type: 'ACTIVITY' })),
  });

  async function cleanup() {
    await prisma.challenge.deleteMany({ where: { year: YEAR } });
    await prisma.user.deleteMany({ where: { email: { startsWith: 'e2e-clean-' } } });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
    await app.init();
    http = app.getHttpServer();
    prisma = app.get(PrismaService);
    await cleanup();

    const passwordHash = await argon2.hash('Secret123');
    await prisma.user.create({ data: { email: 'e2e-clean-admin@reto.local', name: 'Admin', passwordHash, role: UserRole.ADMIN } });
    anaId = (await prisma.user.create({ data: { email: 'e2e-clean-ana@reto.local', name: 'Ana', passwordHash, role: UserRole.PARTICIPANT } })).id;
    admin = (await request(http).post('/api/auth/login').send({ email: 'e2e-clean-admin@reto.local', password: 'Secret123' })).body.tokens.accessToken;
    ana = (await request(http).post('/api/auth/login').send({ email: 'e2e-clean-ana@reto.local', password: 'Secret123' })).body.tokens.accessToken;

    const created = await request(http).post('/api/challenges').set(auth(admin)).send({
      name: 'E2E Limpieza', month: 1, year: YEAR,
      startDate: `${YEAR}-01-01T00:00:00.000Z`, endDate: `${YEAR}-01-28T23:59:59.000Z`,
      validDays: [0, 1, 2, 3, 4, 5, 6], minHeartRateMinutes: 0,
    });
    challengeId = created.body.id;
    await request(http).post(`/api/challenges/${challengeId}/activate`).set(auth(admin));
    await prisma.challengeParticipant.create({ data: { challengeId, userId: anaId } });
  });

  afterAll(async () => {
    await cleanup();
    await app?.close();
  });

  it('CLEAN: retirar una actividad borra sus fotos del almacenamiento y responde 204', async () => {
    const photo = await upload('activity', 'entreno.png');
    const hr = await upload('activity', 'fc.png');
    expect(existsSync(photo.path) && existsSync(hr.path)).toBe(true);
    const act = await request(http).post('/api/activities').set(auth(ana)).send(activity(`${YEAR}-01-05`, [photo, hr]));
    expect(act.status).toBe(201);

    const del = await request(http).delete(`/api/activities/${act.body.id}`).set(auth(ana));
    expect(del.status).toBe(204);
    expect(await gone(photo.path)).toBe(true);
    expect(await gone(hr.path)).toBe(true);
  });

  it('CLEAN: un archivo que otra actividad sigue usando se conserva hasta que se borra la última', async () => {
    const shared = await upload('activity', 'compartida.png');
    const first = await request(http).post('/api/activities').set(auth(ana)).send(activity(`${YEAR}-01-06`, [shared]));
    const second = await request(http).post('/api/activities').set(auth(ana)).send(activity(`${YEAR}-01-07`, [shared]));
    expect([first.status, second.status]).toEqual([201, 201]);

    await request(http).delete(`/api/activities/${first.body.id}`).set(auth(ana));
    await new Promise((r) => setTimeout(r, 300));
    expect(existsSync(shared.path)).toBe(true);

    await request(http).delete(`/api/activities/${second.body.id}`).set(auth(admin));
    expect(await gone(shared.path)).toBe(true);
  });

  it('CLEAN: una foto importada (import/...) nunca se borra al retirar la actividad', async () => {
    const dir = join(process.cwd(), 'uploads', 'import', 'e2e-clean');
    mkdirSync(dir, { recursive: true });
    const path = join(dir, 'hoja.png');
    writeFileSync(path, 'x');
    const act = await prisma.dailyActivity.create({
      data: {
        challengeId, userId: anaId, date: new Date(`${YEAR}-01-08`), exerciseType: 'RUNNING', durationMinutes: 30,
        photos: { create: [{ url: 'http://localhost:3000/uploads/import/e2e-clean/hoja.png', cloudinaryId: 'import/e2e-clean/hoja' }] },
      },
    });
    try {
      expect((await request(http).delete(`/api/activities/${act.id}`).set(auth(admin))).status).toBe(204);
      await new Promise((r) => setTimeout(r, 300));
      expect(existsSync(path)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  describe('reporte de huérfanos (scripts/cloudinary-orphans.mjs)', () => {
    const script = join(process.cwd(), '..', 'scripts', 'cloudinary-orphans.mjs');
    const run = (...flags: string[]) =>
      spawnSync(process.execPath, [script, ...flags], { encoding: 'utf8', env: { ...process.env, CLOUDINARY_FOLDER: 'reto-constancia' } });

    it('CLEAN: en modo local lista el archivo huérfano y no el referenciado, sin borrar nada', async () => {
      const kept = await upload('activity', 'referenciada.png');
      const orphan = await upload('activity', 'huerfana.png');
      const act = await request(http).post('/api/activities').set(auth(ana)).send(activity(`${YEAR}-01-10`, [kept]));
      expect(act.status).toBe(201);

      const res = run('--local', '--json');
      expect(res.status).toBe(0);
      const report = JSON.parse(res.stdout) as { orphans: { id: string; category: string; bytes: number }[]; totalBytes: number };
      const ids = report.orphans.map((o) => o.id);
      expect(ids).toContain(orphan.cloudinaryId);
      expect(ids).not.toContain(kept.cloudinaryId);
      expect(report.orphans.find((o) => o.id === orphan.cloudinaryId)?.category).toBe('activity');
      expect(report.totalBytes).toBeGreaterThan(0);
      expect(existsSync(orphan.path)).toBe(true);
      rmSync(orphan.path, { force: true });
    });

    it('CLEAN: sin credenciales de Cloudinary y sin --local sale con código 1 y un mensaje claro', () => {
      const res = spawnSync(process.execPath, [script], {
        encoding: 'utf8',
        env: { ...process.env, CLOUDINARY_CLOUD_NAME: '', CLOUDINARY_API_KEY: '', CLOUDINARY_API_SECRET: '' },
      });
      expect(res.status).toBe(1);
      expect(res.stderr).toContain('--local');
    });
  });

  it('CLEAN: por defecto el comprobante reemplazado se conserva', async () => {
    const first = await upload('payment-proof', 'recibo-1.pdf');
    const second = await upload('payment-proof', 'recibo-2.pdf');
    const send = (p: { url: string; cloudinaryId: string }) =>
      request(http).patch(`/api/challenges/${challengeId}/participants/me/payment-proof`).set(auth(ana))
        .send({ paymentProofUrl: p.url, paymentProofCloudinaryId: p.cloudinaryId });
    expect((await send(first)).status).toBe(200);
    expect((await send(second)).status).toBe(200);
    await new Promise((r) => setTimeout(r, 300));
    expect(existsSync(first.path)).toBe(true);
    expect(existsSync(second.path)).toBe(true);
  });
});
