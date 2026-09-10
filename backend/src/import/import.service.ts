import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ActivityStatus,
  Challenge,
  ExerciseType,
  PhotoType,
  UserRole,
} from '@prisma/client';
import * as argon2 from 'argon2';
import * as XLSX from 'xlsx';

import { PrismaService } from '../prisma/prisma.service';
import { ImportOptionsDto, DuplicateStrategy } from './dto/import-options.dto';
import { assessHeartRate } from '../activities/heart-rate-rule';
import { SheetsClient, SheetsReadError } from './sheets.client';
import { SheetImportDto } from './dto/sheet-import.dto';

export const TEMPLATE_HEADERS = [
  'email',
  'name',
  'challengeMonth',
  'challengeYear',
  'date',
  'exerciseType',
  'durationMinutes',
  'distanceKm',
  'avgHeartRate',
  'heartRateMinutes',
  'hasHeartRateProof',
  'status',
  'notes',
  'photoUrl',
] as const;

type Header = (typeof TEMPLATE_HEADERS)[number];
export type RawRow = Record<string, unknown>;

/** Columnas sin las cuales una fila no puede validarse (las demás son opcionales). */
export const REQUIRED_HEADERS: readonly Header[] = [
  'email',
  'name',
  'challengeMonth',
  'challengeYear',
  'date',
  'exerciseType',
  'durationMinutes',
];

export interface SheetStatus {
  configured: boolean;
  readable: boolean;
  reason?: 'not_configured' | 'not_shared' | 'not_found' | 'invalid_range' | 'api_error';
  message?: string;
  title?: string;
  sheets?: string[];
  range?: string;
  rowCount?: number;
}

export interface NormalizedRow {
  email: string;
  name: string;
  challengeMonth: number;
  challengeYear: number;
  date: string; // ISO yyyy-mm-dd
  exerciseType: ExerciseType;
  durationMinutes: number;
  distanceKm?: number;
  avgHeartRate?: number;
  heartRateMinutes?: number;
  hasHeartRateProof: boolean;
  status?: ActivityStatus;
  notes?: string;
  photoUrl?: string;
}

export interface PreviewRow {
  row: number;
  data: RawRow;
  errors: string[];
  /** Filas válidas que no cumplen la regla de FC del reto (se importan igual) */
  warnings: string[];
  valid: boolean;
}

export interface PreviewResult {
  summary: { total: number; valid: number; invalid: number; warnings: number };
  rows: PreviewRow[];
}

export interface CommitResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  usersCreated: number;
  participantsCreated: number;
  errors: { row: number; message: string }[];
}

interface CommitContext {
  defaultStatus: ActivityStatus;
  strategy: DuplicateStrategy;
  passwordHash: string;
  adminId: string;
}

@Injectable()
export class ImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sheets?: SheetsClient,
  ) {}

  // ---------- Parsing ----------

  parse(buffer: Buffer): RawRow[] {
    let wb: XLSX.WorkBook;
    try {
      // raw: true evita que el parser de CSV convierta fechas a serial con desfase de zona horaria
      // ('2026-12-26' llegaba como '12/25/26'). Las celdas de XLSX conservan su tipo.
      wb = XLSX.read(buffer, { type: 'buffer', raw: true });
    } catch {
      throw new BadRequestException(
        'No se pudo leer el archivo. Usa un CSV o XLSX válido.',
      );
    }
    const sheetName = wb.SheetNames[0];
    if (!sheetName) throw new BadRequestException('El archivo no tiene hojas.');
    const sheet = wb.Sheets[sheetName];
    return XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: '', raw: false });
  }

  // ---------- Validation ----------

  validateRow(raw: RawRow): { normalized: NormalizedRow | null; errors: string[] } {
    const errors: string[] = [];
    const get = (k: Header) => String(raw[k] ?? '').trim();

    const email = get('email').toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push('email inválido');
    }

    const name = get('name');
    if (!name || name.length < 2) errors.push('name requerido (mínimo 2)');

    const month = Number(get('challengeMonth'));
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      errors.push('challengeMonth debe ser un entero 1..12');
    }

    const year = Number(get('challengeYear'));
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      errors.push('challengeYear inválido');
    }

    const date = this.normalizeDate(get('date'));
    if (!date) errors.push('date inválida (usa YYYY-MM-DD)');

    const exerciseTypeRaw = get('exerciseType').toUpperCase();
    const exerciseType = (Object.values(ExerciseType) as string[]).includes(
      exerciseTypeRaw,
    )
      ? (exerciseTypeRaw as ExerciseType)
      : null;
    if (!exerciseType) {
      errors.push(`exerciseType inválido (${Object.values(ExerciseType).join('|')})`);
    }

    const durationMinutes = Number(get('durationMinutes'));
    if (!Number.isInteger(durationMinutes) || durationMinutes < 1) {
      errors.push('durationMinutes debe ser un entero >= 1');
    }

    const distanceRaw = get('distanceKm');
    let distanceKm: number | undefined;
    if (distanceRaw) {
      distanceKm = Number(distanceRaw.replace(',', '.'));
      if (Number.isNaN(distanceKm) || distanceKm < 0) {
        errors.push('distanceKm inválido');
      }
    }

    const hrRaw = get('avgHeartRate');
    let avgHeartRate: number | undefined;
    if (hrRaw) {
      avgHeartRate = Number(hrRaw);
      if (!Number.isInteger(avgHeartRate) || avgHeartRate < 30) {
        errors.push('avgHeartRate debe ser un entero >= 30');
      }
    }

    const hrMinRaw = get('heartRateMinutes');
    let heartRateMinutes: number | undefined;
    if (hrMinRaw) {
      heartRateMinutes = Number(hrMinRaw);
      if (!Number.isInteger(heartRateMinutes) || heartRateMinutes < 1) {
        errors.push('heartRateMinutes debe ser un entero >= 1');
      } else if (Number.isInteger(durationMinutes) && heartRateMinutes > durationMinutes) {
        errors.push('heartRateMinutes no puede superar durationMinutes');
      }
    }

    const hasHeartRateProof = this.parseBool(get('hasHeartRateProof'));

    const statusRaw = get('status').toUpperCase();
    let status: ActivityStatus | undefined;
    if (statusRaw) {
      if ((Object.values(ActivityStatus) as string[]).includes(statusRaw)) {
        status = statusRaw as ActivityStatus;
      } else {
        errors.push(`status inválido (${Object.values(ActivityStatus).join('|')})`);
      }
    }

    const notes = get('notes') || undefined;
    const photoUrl = get('photoUrl') || undefined;

    if (errors.length > 0) return { normalized: null, errors };

    return {
      normalized: {
        email,
        name,
        challengeMonth: month,
        challengeYear: year,
        date: date as string,
        exerciseType: exerciseType as ExerciseType,
        durationMinutes,
        distanceKm,
        avgHeartRate,
        heartRateMinutes,
        hasHeartRateProof,
        status,
        notes,
        photoUrl,
      },
      errors: [],
    };
  }

  // ---------- Preview (dry-run) ----------

  async preview(buffer: Buffer): Promise<PreviewResult> {
    return this.previewRows(this.parse(buffer));
  }

  /** Preview sobre filas ya parseadas (archivo o Google Sheet). */
  async previewRows(rows: RawRow[]): Promise<PreviewResult> {
    const challengeCache = new Map<string, Challenge | null>();
    const previews: PreviewRow[] = [];
    let valid = 0;
    let warnings = 0;

    for (let i = 0; i < rows.length; i++) {
      const { normalized, errors } = this.validateRow(rows[i]);
      const rowErrors = [...errors];
      const rowWarnings: string[] = [];

      if (normalized) {
        const key = `${normalized.challengeMonth}-${normalized.challengeYear}`;
        let challenge = challengeCache.get(key);
        if (challenge === undefined) {
          challenge = await this.prisma.challenge.findUnique({
            where: {
              month_year: {
                month: normalized.challengeMonth,
                year: normalized.challengeYear,
              },
            },
          });
          challengeCache.set(key, challenge);
        }
        if (!challenge) {
          rowErrors.push(
            `No existe un reto para ${normalized.challengeMonth}/${normalized.challengeYear}`,
          );
        } else {
          // Regla de FC: se informa como advertencia, la fila se importa igual (registros históricos)
          const assessment = assessHeartRate(challenge, {
            heartRateMinutes: normalized.heartRateMinutes ?? null,
            hasHeartRateProof: normalized.hasHeartRateProof,
          });
          if (!assessment.compliant) {
            rowWarnings.push(
              `No cumple la regla de FC del reto: ${assessment.reasons.join('. ')}`,
            );
          }
        }
      }

      const isValid = rowErrors.length === 0;
      if (isValid) valid++;
      if (isValid && rowWarnings.length > 0) warnings++;
      previews.push({
        row: i + 2,
        data: rows[i],
        errors: rowErrors,
        warnings: isValid ? rowWarnings : [],
        valid: isValid,
      });
    }

    return {
      summary: { total: rows.length, valid, invalid: rows.length - valid, warnings },
      rows: previews,
    };
  }

  // ---------- Commit ----------

  async commit(
    buffer: Buffer,
    options: ImportOptionsDto,
    adminId: string,
  ): Promise<CommitResult> {
    return this.commitRows(this.parse(buffer), options, adminId);
  }

  /** Commit sobre filas ya parseadas (archivo o Google Sheet). */
  async commitRows(
    rows: RawRow[],
    options: ImportOptionsDto,
    adminId: string,
  ): Promise<CommitResult> {
    const tempPassword = options.defaultPassword ?? this.randomPassword();
    const ctx: CommitContext = {
      defaultStatus: options.defaultStatus ?? ActivityStatus.VALIDATED,
      strategy: options.duplicateStrategy ?? 'skip',
      passwordHash: await argon2.hash(tempPassword),
      adminId,
    };

    const result: CommitResult = {
      total: rows.length,
      created: 0,
      updated: 0,
      skipped: 0,
      usersCreated: 0,
      participantsCreated: 0,
      errors: [],
    };

    const challengeCache = new Map<string, Challenge | null>();

    for (let i = 0; i < rows.length; i++) {
      const rowNumber = i + 2;
      const { normalized, errors } = this.validateRow(rows[i]);
      if (!normalized) {
        result.errors.push({ row: rowNumber, message: errors.join('; ') });
        continue;
      }
      try {
        await this.applyRow(normalized, ctx, result, challengeCache);
      } catch (e) {
        result.errors.push({
          row: rowNumber,
          message: e instanceof Error ? e.message : 'Error desconocido',
        });
      }
    }

    return result;
  }

  private async applyRow(
    n: NormalizedRow,
    ctx: CommitContext,
    result: CommitResult,
    cache: Map<string, Challenge | null>,
  ): Promise<void> {
    const key = `${n.challengeMonth}-${n.challengeYear}`;
    let challenge = cache.get(key);
    if (challenge === undefined) {
      challenge = await this.prisma.challenge.findUnique({
        where: { month_year: { month: n.challengeMonth, year: n.challengeYear } },
      });
      cache.set(key, challenge);
    }
    if (!challenge) {
      throw new Error(`No existe un reto para ${n.challengeMonth}/${n.challengeYear}`);
    }

    let user = await this.prisma.user.findUnique({ where: { email: n.email } });
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: n.email,
          name: n.name,
          passwordHash: ctx.passwordHash,
          role: UserRole.PARTICIPANT,
        },
      });
      result.usersCreated++;
    }

    const participation = await this.prisma.challengeParticipant.findUnique({
      where: {
        challengeId_userId: { challengeId: challenge.id, userId: user.id },
      },
    });
    if (!participation) {
      await this.prisma.challengeParticipant.create({
        data: { challengeId: challenge.id, userId: user.id },
      });
      result.participantsCreated++;
    }

    const date = new Date(`${n.date}T00:00:00.000Z`);
    const status = n.status ?? ctx.defaultStatus;
    const validatedFields =
      status === ActivityStatus.VALIDATED
        ? { validatedById: ctx.adminId, validatedAt: new Date() }
        : {};

    const existing = await this.prisma.dailyActivity.findUnique({
      where: {
        challengeId_userId_date: {
          challengeId: challenge.id,
          userId: user.id,
          date,
        },
      },
    });

    if (existing) {
      if (ctx.strategy === 'skip') {
        result.skipped++;
        return;
      }
      await this.prisma.dailyActivity.update({
        where: { id: existing.id },
        data: {
          exerciseType: n.exerciseType,
          durationMinutes: n.durationMinutes,
          distanceKm: n.distanceKm ?? null,
          avgHeartRate: n.avgHeartRate ?? null,
          heartRateMinutes: n.heartRateMinutes ?? null,
          hasHeartRateProof: n.hasHeartRateProof,
          notes: n.notes ?? null,
          status,
          rejectionReason: null,
          ...validatedFields,
        },
      });
      result.updated++;
      return;
    }

    await this.prisma.dailyActivity.create({
      data: {
        challengeId: challenge.id,
        userId: user.id,
        date,
        exerciseType: n.exerciseType,
        durationMinutes: n.durationMinutes,
        distanceKm: n.distanceKm ?? null,
        avgHeartRate: n.avgHeartRate ?? null,
        heartRateMinutes: n.heartRateMinutes ?? null,
        hasHeartRateProof: n.hasHeartRateProof,
        notes: n.notes ?? null,
        status,
        ...validatedFields,
        photos: n.photoUrl
          ? {
              create: [
                {
                  url: n.photoUrl,
                  cloudinaryId: `import/${user.id}/${n.date}`,
                  type: PhotoType.ACTIVITY,
                },
              ],
            }
          : undefined,
      },
    });
    result.created++;
  }

  // ---------- Google Sheets (spec google-sheets-import) ----------

  /**
   * Convierte la matriz de valores de una hoja en filas con las claves de la plantilla.
   * La primera fila no vacía es la cabecera (sin distinguir mayúsculas ni espacios);
   * las filas vacías se ignoran y cada celda se conserva como texto (igual que un CSV).
   */
  rowsFromSheet(values: string[][]): RawRow[] {
    const isBlank = (row: unknown[] | undefined) =>
      !row || row.every((c) => String(c ?? '').trim() === '');
    const headerIndex = values.findIndex((row) => !isBlank(row));
    if (headerIndex === -1) {
      throw new BadRequestException('La hoja está vacía: falta la fila de cabecera');
    }
    const canonical = new Map(TEMPLATE_HEADERS.map((h) => [h.toLowerCase(), h]));
    const headers = values[headerIndex].map((cell) => {
      const key = String(cell ?? '').trim();
      return canonical.get(key.toLowerCase()) ?? key;
    });
    const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Faltan columnas requeridas en la hoja: ${missing.join(', ')}`,
      );
    }
    const rows: RawRow[] = [];
    for (const row of values.slice(headerIndex + 1)) {
      if (isBlank(row)) continue;
      const record: RawRow = {};
      headers.forEach((h, i) => {
        if (h) record[h] = String(row[i] ?? '').trim();
      });
      rows.push(record);
    }
    return rows;
  }

  private requireSheets(): SheetsClient {
    if (!this.sheets || !this.sheets.isConfigured()) {
      throw new ServiceUnavailableException(
        'Integración con Google Sheets no configurada: define GOOGLE_SERVICE_ACCOUNT_EMAIL y GOOGLE_PRIVATE_KEY',
      );
    }
    return this.sheets;
  }

  private async readSheet(
    dto: SheetImportDto,
  ): Promise<{ values: string[][]; range: string; title: string; sheets: string[] }> {
    const client = this.requireSheets();
    try {
      const info = await client.getSpreadsheet(dto.spreadsheetId);
      const range = dto.range?.trim() || client.defaultRange() || info.sheets[0] || 'A:Z';
      const values = await client.getValues(dto.spreadsheetId, range);
      return { values, range, title: info.title, sheets: info.sheets };
    } catch (e) {
      if (e instanceof SheetsReadError) throw new BadRequestException(e.message);
      throw e;
    }
  }

  async getSheetStatus(spreadsheetId?: string, range?: string): Promise<SheetStatus> {
    if (!this.sheets || !this.sheets.isConfigured()) {
      return {
        configured: false,
        readable: false,
        reason: 'not_configured',
        message:
          'Integración con Google Sheets no configurada (GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY)',
      };
    }
    if (!spreadsheetId) return { configured: true, readable: false };
    try {
      const { values, range: resolved, title, sheets } = await this.readSheet({
        spreadsheetId,
        range,
      });
      const dataRows = this.rowsFromSheetSafe(values);
      return {
        configured: true,
        readable: true,
        title,
        sheets,
        range: resolved,
        rowCount: dataRows,
      };
    } catch (e) {
      if (e instanceof BadRequestException) {
        const reason = this.reasonFromMessage(e.message);
        return { configured: true, readable: false, reason, message: e.message };
      }
      throw e;
    }
  }

  private rowsFromSheetSafe(values: string[][]): number {
    try {
      return this.rowsFromSheet(values).length;
    } catch {
      return 0;
    }
  }

  private reasonFromMessage(message: string): SheetStatus['reason'] {
    if (/acceso|compártela/i.test(message)) return 'not_shared';
    if (/no existe/i.test(message)) return 'not_found';
    if (/rango|inválid/i.test(message)) return 'invalid_range';
    return 'api_error';
  }

  async previewSheet(dto: SheetImportDto): Promise<PreviewResult> {
    const { values } = await this.readSheet(dto);
    return this.previewRows(this.rowsFromSheet(values));
  }

  async commitSheet(
    dto: SheetImportDto,
    options: ImportOptionsDto,
    adminId: string,
  ): Promise<CommitResult> {
    // Se lee toda la hoja antes de escribir: un fallo de lectura nunca deja un import parcial
    const { values } = await this.readSheet(dto);
    return this.commitRows(this.rowsFromSheet(values), options, adminId);
  }

  // ---------- Template ----------

  buildTemplate(format: 'csv' | 'xlsx'): {
    buffer: Buffer;
    filename: string;
    contentType: string;
  } {
    const example: Record<Header, string | number>[] = [
      {
        email: 'ana@reto.local',
        name: 'Ana Pérez',
        challengeMonth: 5,
        challengeYear: 2026,
        date: '2026-05-04',
        exerciseType: 'RUNNING',
        durationMinutes: 35,
        distanceKm: 5.2,
        avgHeartRate: 148,
        heartRateMinutes: 30,
        hasHeartRateProof: 'true',
        status: 'VALIDATED',
        notes: 'Trote matutino',
        photoUrl: 'https://picsum.photos/seed/ana-0504/900/600',
      },
      {
        email: 'bruno@reto.local',
        name: 'Bruno Díaz',
        challengeMonth: 5,
        challengeYear: 2026,
        date: '2026-05-05',
        exerciseType: 'CYCLING',
        durationMinutes: 40,
        distanceKm: 12,
        avgHeartRate: 135,
        heartRateMinutes: '',
        hasHeartRateProof: 'false',
        status: 'VALIDATED',
        notes: '',
        photoUrl: '',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(example, {
      header: [...TEMPLATE_HEADERS],
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'actividades');

    if (format === 'csv') {
      const csv = XLSX.utils.sheet_to_csv(ws);
      return {
        buffer: Buffer.from(csv, 'utf8'),
        filename: 'plantilla-importacion.csv',
        contentType: 'text/csv; charset=utf-8',
      };
    }

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    return {
      buffer,
      filename: 'plantilla-importacion.xlsx',
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  // ---------- Helpers ----------

  private normalizeDate(value: string): string | null {
    if (!value) return null;

    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;

    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;

    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);

    return null;
  }

  private parseBool(v: string): boolean {
    return ['true', '1', 'si', 'sí', 'x', 'yes', 'y', 'verdadero'].includes(
      v.toLowerCase(),
    );
  }

  private randomPassword(): string {
    return `Import-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(
      36,
    )}`;
  }
}
