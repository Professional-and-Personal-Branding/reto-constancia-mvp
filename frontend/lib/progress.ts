/**
 * "Mi avance" (spec participant-calendar): cuánto falta para el mínimo de días validados y si los
 * días que quedan alcanzan. Funciones puras, sin React ni fechas. La calificación real la decide el
 * servidor al cierre; los textos no prometen nada antes de eso.
 */
import type { CalendarDay } from './types.ts';

export type ProgressState = 'QUALIFIED' | 'NO_SCORE' | 'REACHABLE' | 'OUT_OF_REACH';

export interface ProgressRow {
  validatedDays: number;
  pendingDays: number;
  score: number;
  qualified: boolean;
}

export interface QualifyProgress {
  state: ProgressState;
  validated: number;
  target: number;
  missing: number;
  pending: number;
  open: number;
  percent: number;
}

/** Copia web de `isQualified` del servidor; la tabla de paridad impide que se separen. */
export function qualifiesLike(min: number, validatedDays: number, score: number): boolean {
  return validatedDays >= min && score > 0;
}

export function qualifyProgress(input: { min: number; row: ProgressRow; days: CalendarDay[] }): QualifyProgress {
  const { min, row, days } = input;
  const target = Math.max(min, 1);
  const validated = row.validatedDays;
  const pending = row.pendingDays;
  const open = days.filter((d) => d.valid && (d.activity === null || d.activity.status === 'REJECTED')).length;
  const missing = Math.max(0, target - validated);
  const percent = Math.min(100, Math.round((validated * 100) / target));

  let state: ProgressState;
  if (row.qualified) state = 'QUALIFIED';
  else if (validated >= target) state = 'NO_SCORE';
  else if (missing <= pending + open) state = 'REACHABLE';
  else state = 'OUT_OF_REACH';

  return { state, validated, target, missing, pending, open, percent };
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Mensaje principal y, solo si es alcanzable, la línea de detalle. */
export function progressMessage(p: QualifyProgress): { main: string; detail: string | null } {
  switch (p.state) {
    case 'QUALIFIED':
      return { main: 'Ya alcanzas el mínimo; se confirma al cierre.', detail: null };
    case 'NO_SCORE':
      return {
        main: 'Alcanzas el mínimo de días, pero tu puntaje todavía es 0; se confirma al cierre.',
        detail: null,
      };
    case 'REACHABLE':
      return {
        main: `${p.missing === 1 ? 'Te falta' : 'Te faltan'} ${plural(p.missing, 'día validado', 'días validados')} para el mínimo; aún puedes llegar.`,
        detail: `Tienes ${plural(p.pending, 'pendiente', 'pendientes')} de validar y ${plural(p.open, 'día válido', 'días válidos')} sin registrar en el período.`,
      };
    default:
      return {
        main: `Con los días que quedan no alcanzarías el mínimo de ${plural(p.target, 'día validado', 'días validados')}. Cada actividad sigue sumando puntos.`,
        detail: null,
      };
  }
}
