import { BadRequestException, Injectable } from '@nestjs/common';
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
type RawRow = Record<string, unknown>;

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
  constructor(private readonly prisma: PrismaService) {}

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
    const rows = this.parse(buffer);
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
    const rows = this.parse(buffer);
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
