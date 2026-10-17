import { ActivityStatus, ChallengeStatus, ExerciseType } from '@prisma/client';

import { assessHeartRate } from './heart-rate-rule';

/**
 * Calendario del participante (spec participant-calendar). Función pura: recorre cada día UTC
 * del período y pregunta `valid` a las MISMAS reglas que usa `ActivitiesService.create`
 * (`ChallengesService.isWithinPeriod` / `isValidDay`, inyectadas, nunca copiadas). No depende
 * de la fecha actual: "hoy" lo decide el cliente.
 */
export interface CalendarChallenge {
  status: ChallengeStatus;
  startDate: Date;
  endDate: Date;
  validDays: number[];
  minHeartRateMinutes: number;
}

export interface CalendarRules {
  isWithinPeriod(challenge: never, date: Date): boolean;
  isValidDay(challenge: never, date: Date): boolean;
}

/** Fila mínima de `DailyActivity` que consulta el calendario (sin fotos ni usuario). */
export interface CalendarActivityRow {
  id: string;
  date: Date;
  status: ActivityStatus;
  exerciseType: ExerciseType;
  durationMinutes: number;
  distanceKm: { toString(): string } | null;
  heartRateMinutes: number | null;
  hasHeartRateProof: boolean;
  rejectionReason: string | null;
}

export interface CalendarActivity {
  id: string;
  status: ActivityStatus;
  exerciseType: ExerciseType;
  durationMinutes: number;
  distanceKm: string | null;
  heartRateMinutes: number | null;
  heartRateCompliant: boolean;
  rejectionReason: string | null;
}

export interface CalendarDay {
  date: string;
  valid: boolean;
  activity: CalendarActivity | null;
}

export interface CalendarSummary {
  validDaysTotal: number;
  registered: number;
  validated: number;
  pending: number;
  rejected: number;
}

export interface MyCalendar {
  status: ChallengeStatus;
  startDate: string;
  endDate: string;
  validDays: number[];
  days: CalendarDay[];
  summary: CalendarSummary;
}

const DAY_MS = 86_400_000;

const dayKey = (date: Date): string => date.toISOString().slice(0, 10);

function startOfUtcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function buildCalendar(
  challenge: CalendarChallenge,
  activities: CalendarActivityRow[],
  rules: CalendarRules,
): MyCalendar {
  const byDay = new Map<string, CalendarActivityRow>();
  for (const activity of activities) byDay.set(dayKey(activity.date), activity);

  const summary: CalendarSummary = { validDaysTotal: 0, registered: 0, validated: 0, pending: 0, rejected: 0 };
  const days: CalendarDay[] = [];
  const last = startOfUtcDay(challenge.endDate);

  for (let t = startOfUtcDay(challenge.startDate); t <= last; t += DAY_MS) {
    const date = new Date(t);
    const key = dayKey(date);
    const valid = rules.isWithinPeriod(challenge as never, date) && rules.isValidDay(challenge as never, date);
    const row = byDay.get(key);
    let activity: CalendarActivity | null = null;
    if (row) {
      activity = {
        id: row.id,
        status: row.status,
        exerciseType: row.exerciseType,
        durationMinutes: row.durationMinutes,
        distanceKm: row.distanceKm === null ? null : row.distanceKm.toString(),
        heartRateMinutes: row.heartRateMinutes,
        heartRateCompliant: assessHeartRate(challenge, row).compliant,
        rejectionReason: row.rejectionReason,
      };
      summary.registered += 1;
      if (row.status === ActivityStatus.VALIDATED) summary.validated += 1;
      else if (row.status === ActivityStatus.PENDING) summary.pending += 1;
      else if (row.status === ActivityStatus.REJECTED) summary.rejected += 1;
    }
    if (valid) summary.validDaysTotal += 1;
    days.push({ date: key, valid, activity });
  }

  return {
    status: challenge.status,
    startDate: dayKey(new Date(startOfUtcDay(challenge.startDate))),
    endDate: dayKey(new Date(last)),
    validDays: challenge.validDays,
    days,
    summary,
  };
}
