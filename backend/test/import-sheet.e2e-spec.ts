import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SheetsClient, SheetsReadError, SpreadsheetInfo } from '../src/import/sheets.client';

/**
 * E2E de la importación desde Google Sheets (OpenSpec: google-sheets-import) con un cliente
 * falso en memoria: CI no tiene acceso a Google. Datos propios (año 2097, `e2e-sheet-*`).
 */
const YEAR = 2097;
const HEADER = [
  'email', 'name', 'challengeMonth', 'challengeYear', 'date', 'exerciseType',
  'durationMinutes', 'heartRateMinutes', 'hasHeartRateProof', 'status',
];

class FakeSheetsClient {
  configured = true;
  spreadsheets: Record<string, { info: SpreadsheetInfo; values: Record<string, string[][]> }> = {};

  isConfigured() {
    return this.configured;
  }
  defaultRange(): string | undefined {
    return undefined;
  }
  async getSpreadsheet(id: string): Promise<SpreadsheetInfo> {
    if (id === 'private-sheet') throw new SheetsReadError('not_shared', 'Sin acceso a la hoja: compártela con la cuenta de servicio');
    const s = this.spreadsheets[id];
    if (!s) throw new SheetsReadError('not_found', 'La hoja no existe');
    return s.info;
  }
  async getValues(id: string, range: string): Promise<string[][]> {
    const s = this.spreadsheets[id];
    if (!s) throw new SheetsReadError('not_found', 'La hoja no existe');
    const key = range.split('!')[0];
    const values = s.values[key];
    if (!values) throw new SheetsReadError('invalid_range', `Rango u hoja inválidos: ${range}`);
    return values;
  }
}

describe('Importación desde Google Sheets (e2e, cliente falso)', () => {
  let app: INestApplication;
  let http: import('http').Server;
  let prisma: PrismaService;
  const fake = new FakeSheetsClient();

  const password = 'Secret123';
  const adminEmail = 'e2e-sheet-admin@reto.local';
  const anaEmail = 'e2e-sheet-ana@reto.local';
  let adminToken: string;
  let anaToken: string;

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function login(email: string) {
    const res = await request(http).post('/api/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    return res.body.tokens.accessToken as string;
  }

  async function cleanup() {
    await prisma.challenge.deleteMany({ where: { year: YEAR } });
    await prisma.user.deleteMany({ where: { email: { startsWith: 'e2e-sheet-' } } });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SheetsClient)
      .useValue(fake)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }),
    );
    await app.init();
    http = app.getHttpServer();
    prisma = app.get(PrismaService);
    await cleanup();

    const passwordHash = await argon2.hash(password);
    await prisma.user.create({ data: { email: adminEmail, name: 'E2E Sheet Admin', passwordHash, role: UserRole.ADMIN } });
    await prisma.user.create({ data: { email: anaEmail, name: 'E2E Sheet Ana', passwordHash, role: UserRole.PARTICIPANT } });
    adminToken = await login(adminEmail);
    anaToken = await login(anaEmail);

    // Reto destino de las filas (1/2097, mínimo de FC 20)
    const ch = await request(http).post('/api/challenges').set(auth(adminToken)).send({
      name: 'E2E Sheet', month: 1, year: YEAR,
      startDate: `${YEAR}-01-01T00:00:00.000Z`, endDate: `${YEAR}-01-31T23:59:59.000Z`,
      validDays: [0, 1, 2, 3, 4, 5, 6], minHeartRateMinutes: 20,
    });
    expect(ch.status).toBe(201);

    fake.spreadsheets['shared-sheet'] = {
      info: { title: 'Registro E2E', sheets: ['enero', 'febrero'] },
      values: {
        enero: [
          HEADER,
          ['e2e-sheet-p1@reto.local', 'P1', '1', String(YEAR), `${YEAR}-01-05`, 'RUNNING', '35', '25', 'true', 'PENDING'],
          [],
          ['e2e-sheet-p2@reto.local', 'P2', '1', String(YEAR), `${YEAR}-01-06`, 'CYCLING', '40', '', 'false', 'PENDING'],
          ['no-email', 'P3', '1', String(YEAR), `${YEAR}-01-07`, 'RUNNING', '30', '25', 'true', ''],
        ],
        febrero: [
          HEADER,
          ['e2e-sheet-p1@reto.local', 'P1', '1', String(YEAR), `${YEAR}-01-08`, 'RUNNING', '35', '25', 'true', 'PENDING'],
        ],
      },
    };
    fake.spreadsheets['no-date-sheet'] = {
      info: { title: 'Sin fecha', sheets: ['datos'] },
      values: { datos: [['email', 'name', 'challengeMonth', 'challengeYear', 'exerciseType', 'durationMinutes'], ['x@y.z', 'X', '1', String(YEAR), 'RUNNING', '30']] },
    };
  });

  afterAll(async () => {
    await cleanup();
    await app?.close();
  });

  it('solo admin (403 para participante)', async () => {
    const res = await request(http).get('/api/import/sheet/status').set(auth(anaToken));
    expect(res.status).toBe(403);
  });

  it('sin configuración: status configured=false, preview y commit 503, archivo sigue funcionando', async () => {
    fake.configured = false;
    try {
      const status = await request(http).get('/api/import/sheet/status?spreadsheetId=shared-sheet').set(auth(adminToken));
      expect(status.status).toBe(200);
      expect(status.body).toMatchObject({ configured: false, reason: 'not_configured' });
      const preview = await request(http).post('/api/import/sheet/preview').set(auth(adminToken)).send({ spreadsheetId: 'shared-sheet' });
      expect(preview.status).toBe(503);
      expect(preview.body.message).toMatch(/GOOGLE_SERVICE_ACCOUNT_EMAIL/);
      const commit = await request(http).post('/api/import/sheet/commit').set(auth(adminToken)).send({ spreadsheetId: 'shared-sheet' });
      expect(commit.status).toBe(503);

      const csv = `${HEADER.join(',')}\n` + `e2e-sheet-file@reto.local,Fila,1,${YEAR},${YEAR}-01-09,RUNNING,35,25,true,PENDING\n`;
      const filePreview = await request(http).post('/api/import/activities/preview').set(auth(adminToken)).attach('file', Buffer.from(csv, 'utf8'), 'rows.csv');
      expect(filePreview.status).toBe(201);
      expect(filePreview.body.rows[0]?.errors).toEqual([]);
      expect(filePreview.body.summary.valid).toBe(1);
    } finally {
      fake.configured = true;
    }
  });

  it('status: hoja compartida legible (título, hojas, rango, filas) y hoja no compartida con motivo', async () => {
    const ok = await request(http).get('/api/import/sheet/status?spreadsheetId=shared-sheet').set(auth(adminToken));
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ configured: true, readable: true, title: 'Registro E2E', sheets: ['enero', 'febrero'], range: 'enero', rowCount: 3 });

    const priv = await request(http).get('/api/import/sheet/status?spreadsheetId=private-sheet').set(auth(adminToken));
    expect(priv.status).toBe(200);
    expect(priv.body).toMatchObject({ configured: true, readable: false, reason: 'not_shared' });

    const bare = await request(http).get('/api/import/sheet/status').set(auth(adminToken));
    expect(bare.body).toMatchObject({ configured: true, readable: false });
  });

  it('preview refleja el resumen del archivo: 3 filas, 2 válidas, 1 inválida, 1 advertencia', async () => {
    const res = await request(http).post('/api/import/sheet/preview').set(auth(adminToken)).send({ spreadsheetId: 'shared-sheet' });
    expect(res.status).toBe(201);
    expect(res.body.summary).toEqual({ total: 3, valid: 2, invalid: 1, warnings: 1 });
    expect(res.body.rows[1].warnings.join(' ')).toMatch(/20/);
    expect(res.body.rows[2].valid).toBe(false);
  });

  it('cabecera incompleta -> 400 nombrando la columna', async () => {
    const res = await request(http).post('/api/import/sheet/preview').set(auth(adminToken)).send({ spreadsheetId: 'no-date-sheet' });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body.message)).toMatch(/date/);
  });

  it('selección de hoja: range=febrero lee solo esa hoja', async () => {
    const res = await request(http).post('/api/import/sheet/preview').set(auth(adminToken)).send({ spreadsheetId: 'shared-sheet', range: 'febrero' });
    expect(res.status).toBe(201);
    expect(res.body.summary.total).toBe(1);
    const bad = await request(http).post('/api/import/sheet/preview').set(auth(adminToken)).send({ spreadsheetId: 'shared-sheet', range: 'marzo' });
    expect(bad.status).toBe(400);
  });

  it('commit es idempotente: crea, luego omite, luego actualiza', async () => {
    const first = await request(http).post('/api/import/sheet/commit?defaultStatus=PENDING').set(auth(adminToken)).send({ spreadsheetId: 'shared-sheet' });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ total: 3, created: 2, updated: 0, skipped: 0, usersCreated: 2 });
    expect(first.body.errors).toHaveLength(1);

    const again = await request(http).post('/api/import/sheet/commit?duplicateStrategy=skip').set(auth(adminToken)).send({ spreadsheetId: 'shared-sheet' });
    expect(again.body).toMatchObject({ created: 0, skipped: 2 });

    const update = await request(http).post('/api/import/sheet/commit?duplicateStrategy=update').set(auth(adminToken)).send({ spreadsheetId: 'shared-sheet' });
    expect(update.body).toMatchObject({ created: 0, updated: 2, skipped: 0 });
  });

  it('hoja no compartida en commit -> 400 sin importar nada', async () => {
    const before = await prisma.dailyActivity.count({ where: { challenge: { year: YEAR } } });
    const res = await request(http).post('/api/import/sheet/commit').set(auth(adminToken)).send({ spreadsheetId: 'private-sheet' });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body.message)).toMatch(/acceso/i);
    const after = await prisma.dailyActivity.count({ where: { challenge: { year: YEAR } } });
    expect(after).toBe(before);
  });
});
