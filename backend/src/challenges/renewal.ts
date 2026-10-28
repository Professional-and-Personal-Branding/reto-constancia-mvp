/*
 * Reglas puras de la renovación mensual (spec challenge-renewal): mes siguiente, período y nombre
 * calculados en el servidor, y la lista explícita de lo que se copia del reto origen.
 */
import { Challenge } from '@prisma/client';

export const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
] as const;

export const RENEW_DRAFT_MESSAGE = 'Solo se puede renovar un reto activo o cerrado';

/** El mes que sigue: diciembre de Y pasa a enero de Y+1. */
export function nextMonth(month: number, year: number): { month: number; year: number } {
  return month === 12 ? { month: 1, year: year + 1 } : { month: month + 1, year };
}

/** Primer y último día del mes, a medianoche UTC (igual que guarda el formulario del reto). */
export function monthPeriod(month: number, year: number): { startDate: Date; endDate: Date } {
  return {
    startDate: new Date(Date.UTC(year, month - 1, 1)),
    endDate: new Date(Date.UTC(year, month, 0)),
  };
}

export function suggestedName(month: number, year: number): string {
  return `Reto ${MONTH_NAMES[month - 1]} ${year}`;
}

/** Fecha sin hora, `YYYY-MM-DD`. */
export function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Lo único que una renovación copia del reto origen (lista explícita, a propósito): una columna
 * nueva del modelo no se copia por accidente. Nunca estado, fechas, pagos ni historial.
 */
export function renewableRules(source: Challenge) {
  return {
    validDays: [...source.validDays],
    minHeartRateMinutes: source.minHeartRateMinutes,
    feePerParticipant: source.feePerParticipant,
    budgetTotal: source.budgetTotal,
    currency: source.currency,
    prizeDescription: source.prizeDescription,
    pointsPerValidatedDay: source.pointsPerValidatedDay,
    pointsPerKm: source.pointsPerKm,
    minValidatedDaysToQualify: source.minValidatedDaysToQualify,
    maxWinners: source.maxWinners,
    tiebreakRule: source.tiebreakRule,
  };
}

export type RenewableRules = ReturnType<typeof renewableRules>;
