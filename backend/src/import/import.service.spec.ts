import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';

import { ImportService } from './import.service';
import { PrismaService } from '../prisma/prisma.service';
import { SheetsClient, SheetsReadError } from './sheets.client';

describe('ImportService (parseo y validación)', () => {
  const service = new ImportService({} as unknown as PrismaService);

  const base: Record<string, string> = {
    email: 'ana@reto.local',
    name: 'Ana',
    challengeMonth: '5',
    challengeYear: '2026',
    date: '2026-05-04',
    exerciseType: 'RUNNING',
    durationMinutes: '35',
    distanceKm: '5.2',
    avgHeartRate: '148',
    heartRateMinutes: '30',
    hasHeartRateProof: 'true',
    status: 'VALIDATED',
    notes: 'ok',
    photoUrl: '',
  };

  describe('validateRow', () => {
    it('acepta una fila válida', () => {
      const { normalized, errors } = service.validateRow({ ...base });
      expect(errors).toHaveLength(0);
      expect(normalized).not.toBeNull();
      expect(normalized?.email).toBe('ana@reto.local');
      expect(normalized?.durationMinutes).toBe(35);
      expect(normalized?.hasHeartRateProof).toBe(true);
      expect(normalized?.status).toBe('VALIDATED');
    });

    it('rechaza email y duración inválidos', () => {
      const { normalized, errors } = service.validateRow({
        ...base,
        email: 'no-email',
        durationMinutes: '0',
      });
      expect(normalized).toBeNull();
      expect(errors.join(' ')).toMatch(/email/);
      expect(errors.join(' ')).toMatch(/durationMinutes/);
    });

    it('rechaza exerciseType inválido', () => {
      const { errors } = service.validateRow({ ...base, exerciseType: 'SWIMMING' });
      expect(errors.join(' ')).toMatch(/exerciseType/);
    });

    it('normaliza fecha en formato DD/MM/YYYY', () => {
      const { normalized } = service.validateRow({ ...base, date: '04/05/2026' });
      expect(normalized?.date).toBe('2026-05-04');
    });

    it('acepta coma decimal en distanceKm', () => {
      const { normalized } = service.validateRow({ ...base, distanceKm: '5,2' });
      expect(normalized?.distanceKm).toBeCloseTo(5.2);
    });
  });

  describe('heartRateMinutes y advertencias de la regla de FC', () => {
    it('parsea heartRateMinutes', () => {
      const { normalized, errors } = service.validateRow({ ...base });
      expect(errors).toHaveLength(0);
      expect(normalized?.heartRateMinutes).toBe(30);
    });

    it('rechaza heartRateMinutes mayor que durationMinutes', () => {
      const { normalized, errors } = service.validateRow({
        ...base,
        durationMinutes: '30',
        heartRateMinutes: '45',
      });
      expect(normalized).toBeNull();
      expect(errors.join(' ')).toMatch(/heartRateMinutes/);
    });

    it('la plantilla incluye la columna heartRateMinutes', () => {
      const rows = service.parse(service.buildTemplate('csv').buffer);
      expect(Object.keys(rows[0])).toContain('heartRateMinutes');
    });

    it('preview: fila sin FC en un reto con mínimo -> válida con advertencia', async () => {
      const prisma = {
        challenge: {
          findUnique: jest.fn().mockResolvedValue({ id: 'c', minHeartRateMinutes: 20 }),
        },
      } as unknown as PrismaService;
      const svc = new ImportService(prisma);
      const preview = await svc.preview(svc.buildTemplate('csv').buffer);
      expect(preview.summary.invalid).toBe(0);
      expect(preview.summary.warnings).toBe(1);
      const ana = preview.rows.find((r) => String(r.data.email).startsWith('ana'));
      const bruno = preview.rows.find((r) => String(r.data.email).startsWith('bruno'));
      expect(ana?.valid).toBe(true);
      expect(ana?.warnings).toHaveLength(0);
      expect(bruno?.valid).toBe(true);
      expect(bruno?.warnings.join(' ')).toMatch(/20/);
    });
  });

  describe('rowsFromSheet (Google Sheets -> filas de la plantilla)', () => {
    const header = ['email', 'name', 'challengeMonth', 'challengeYear', 'date', 'exerciseType', 'durationMinutes'];

    it('mapea la cabecera y conserva las celdas como texto', () => {
      const rows = service.rowsFromSheet([
        header,
        ['a@x.y', 'Ana', '5', '2026', '2026-05-04', 'RUNNING', '35'],
      ]);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ email: 'a@x.y', durationMinutes: '35', date: '2026-05-04' });
    });

    it('acepta cabeceras con mayúsculas y espacios', () => {
      const rows = service.rowsFromSheet([
        [' EMAIL ', 'Name', 'challengemonth', 'CHALLENGEYEAR', 'Date', 'ExerciseType', 'DurationMinutes'],
        ['a@x.y', 'Ana', '5', '2026', '2026-05-04', 'RUNNING', '35'],
      ]);
      expect(Object.keys(rows[0])).toEqual(header);
    });

    it('ignora filas vacías (incluida una cabecera precedida de filas en blanco)', () => {
      const rows = service.rowsFromSheet([
        [],
        header,
        ['a@x.y', 'Ana', '5', '2026', '2026-05-04', 'RUNNING', '35'],
        ['', '', ''],
        ['b@x.y', 'Bruno', '5', '2026', '2026-05-05', 'CYCLING', '40'],
      ]);
      expect(rows).toHaveLength(2);
    });

    it('rechaza cabeceras incompletas nombrando las columnas que faltan', () => {
      expect(() => service.rowsFromSheet([['email', 'name'], ['a@x.y', 'Ana']])).toThrow(
        /challengeMonth.*date/,
      );
      expect(() => service.rowsFromSheet([])).toThrow(BadRequestException);
    });
  });

  describe('estado, preview y commit desde Google Sheets', () => {
    const header = ['email', 'name', 'challengeMonth', 'challengeYear', 'date', 'exerciseType', 'durationMinutes', 'heartRateMinutes', 'hasHeartRateProof'];
    const values = [
      header,
      ['a@x.y', 'Ana', '5', '2026', '2026-05-04', 'RUNNING', '35', '25', 'true'],
      ['b@x.y', 'Bruno', '5', '2026', '2026-05-05', 'CYCLING', '40', '', 'false'],
      ['no-email', 'Carla', '5', '2026', '2026-05-05', 'RUNNING', '30', '25', 'true'],
    ];
    const prisma = {
      challenge: { findUnique: jest.fn().mockResolvedValue({ id: 'c', minHeartRateMinutes: 20 }) },
    } as unknown as PrismaService;

    function stubClient(over: Partial<SheetsClient> = {}): SheetsClient {
      return {
        isConfigured: () => true,
        defaultRange: () => undefined,
        getSpreadsheet: jest.fn().mockResolvedValue({ title: 'Reto', sheets: ['mayo', 'junio'] }),
        getValues: jest.fn().mockResolvedValue(values),
        ...over,
      } as unknown as SheetsClient;
    }

    it('sin configuración: status configured=false y preview 503', async () => {
      const svc = new ImportService(prisma, stubClient({ isConfigured: () => false }));
      expect(await svc.getSheetStatus('sheet')).toMatchObject({ configured: false, reason: 'not_configured' });
      await expect(svc.previewSheet({ spreadsheetId: 'sheet' })).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('status legible: título, hojas, rango resuelto (primera hoja) y filas de datos', async () => {
      const client = stubClient();
      const status = await new ImportService(prisma, client).getSheetStatus('sheet');
      expect(status).toMatchObject({ configured: true, readable: true, title: 'Reto', sheets: ['mayo', 'junio'], range: 'mayo', rowCount: 3 });
      expect(client.getValues).toHaveBeenCalledWith('sheet', 'mayo');
    });

    it('status no compartida: readable=false con motivo', async () => {
      const client = stubClient({
        getSpreadsheet: jest.fn().mockRejectedValue(new SheetsReadError('not_shared', 'Sin acceso a la hoja: compártela con la cuenta')),
      });
      const status = await new ImportService(prisma, client).getSheetStatus('sheet');
      expect(status).toMatchObject({ configured: true, readable: false, reason: 'not_shared' });
    });

    it('preview desde hoja refleja el mismo resumen que el archivo', async () => {
      const preview = await new ImportService(prisma, stubClient()).previewSheet({ spreadsheetId: 'sheet', range: 'junio' });
      expect(preview.summary).toEqual({ total: 3, valid: 2, invalid: 1, warnings: 1 });
    });

    it('fallo de lectura en preview/commit -> 400 con el motivo', async () => {
      const client = stubClient({ getValues: jest.fn().mockRejectedValue(new SheetsReadError('invalid_range', 'Rango u hoja inválidos')) });
      await expect(new ImportService(prisma, client).previewSheet({ spreadsheetId: 'sheet', range: 'nope' })).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('plantilla + parse', () => {
    it('genera CSV reparseable con las cabeceras esperadas', () => {
      const { buffer, filename } = service.buildTemplate('csv');
      expect(filename).toMatch(/\.csv$/);
      const rows = service.parse(buffer);
      expect(rows.length).toBeGreaterThan(0);
      expect(Object.keys(rows[0])).toEqual(
        expect.arrayContaining(['email', 'date', 'exerciseType']),
      );
    });

    it('conserva las fechas ISO de un CSV sin desfase de zona horaria', () => {
      const csv = Buffer.from('email,date,durationMinutes\nx@y.z,2026-12-26,40\n', 'utf8');
      const rows = service.parse(csv);
      expect(rows[0].date).toBe('2026-12-26');
      const { normalized } = service.validateRow({ ...base, ...rows[0] });
      expect(normalized?.date).toBe('2026-12-26');
    });

    it('genera XLSX reparseable', () => {
      const { buffer, filename, contentType } = service.buildTemplate('xlsx');
      expect(filename).toMatch(/\.xlsx$/);
      expect(contentType).toMatch(/spreadsheet/);
      const rows = service.parse(buffer);
      expect(rows.length).toBeGreaterThan(0);
    });
  });
});
