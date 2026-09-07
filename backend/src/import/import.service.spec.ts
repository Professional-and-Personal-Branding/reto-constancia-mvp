import { ImportService } from './import.service';
import { PrismaService } from '../prisma/prisma.service';

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
