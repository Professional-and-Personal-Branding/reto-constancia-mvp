/**
 * Lógica del calendario propio (spec participant-calendar). Funciones puras sobre llaves de día
 * `YYYY-MM-DD` (comparación de cadenas, sin zonas horarias).
 *
 * La web NUNCA decide si un día cuenta: `valid` lo calcula el servidor con las mismas reglas
 * del registro. Aquí solo se deriva la presentación ("hoy", "sin registro"...) y las pistas
 * del formulario; la API sigue validando todo.
 */
import type { CalendarActivity, CalendarDay, MyCalendar } from './types.ts';

/** Mismos textos que los errores de la API. */
export const HINT_REST_DAY = 'Ese día es de descanso en este reto';
export const HINT_OUTSIDE_PERIOD = 'La fecha está fuera del período del reto';
export const HINT_ALREADY_REGISTERED = 'Ya registraste una actividad para ese día';

export type DayState = 'VALIDATED' | 'PENDING' | 'REJECTED' | 'REST' | 'MISSED' | 'TODAY_OPEN' | 'FUTURE';

/** Estado de presentación de un día según su entrada del calendario y el día local del usuario. */
export function dayState(day: CalendarDay, today: string): DayState {
  if (day.activity) return day.activity.status;
  if (!day.valid) return 'REST';
  if (day.date > today) return 'FUTURE';
  if (day.date === today) return 'TODAY_OPEN';
  return 'MISSED';
}

export type TodayDuty =
  | { kind: 'REGISTERED'; activity: CalendarActivity }
  | { kind: 'OPEN' }
  | { kind: 'REST' }
  | { kind: 'BEFORE'; startDate: string }
  | { kind: 'AFTER' };

/** Qué le toca hoy al participante en el reto (tarjeta "Hoy" del panel). */
export function todayDuty(calendar: MyCalendar, today: string): TodayDuty {
  if (today < calendar.startDate) return { kind: 'BEFORE', startDate: calendar.startDate };
  if (today > calendar.endDate) return { kind: 'AFTER' };
  const entry = calendar.days.find((d) => d.date === today);
  if (entry?.activity) return { kind: 'REGISTERED', activity: entry.activity };
  if (entry && !entry.valid) return { kind: 'REST' };
  return { kind: 'OPEN' };
}

/** `min`/`max` del campo fecha: el período, sin pasar de hoy. */
export function uploadDateBounds(
  calendar: MyCalendar | undefined,
  today: string,
): { min: string | undefined; max: string } {
  if (!calendar) return { min: undefined, max: today };
  return { min: calendar.startDate, max: calendar.endDate < today ? calendar.endDate : today };
}

/** Fecha inicial del formulario: `?date=` si es un día del calendario; si no, hoy. */
export function resolveUploadDate(calendar: MyCalendar | undefined, requested: string | null, today: string): string {
  if (calendar && requested && calendar.days.some((d) => d.date === requested)) return requested;
  return today;
}

/** Pista bajo el campo fecha (o `null`); sin calendario no hay pistas. */
export function dateHint(calendar: MyCalendar | undefined, date: string): string | null {
  if (!calendar || !date) return null;
  const entry = calendar.days.find((d) => d.date === date);
  if (!entry) return HINT_OUTSIDE_PERIOD;
  if (!entry.valid) return HINT_REST_DAY;
  if (entry.activity) return HINT_ALREADY_REGISTERED;
  return null;
}

/**
 * Semanas del período para la grilla "Mi mes": siete celdas por semana empezando en lunes (es-BO);
 * `null` son celdas vacías antes del primer día y después del último.
 */
export function weeksOf(days: CalendarDay[]): (CalendarDay | null)[][] {
  if (days.length === 0) return [];
  // Lunes = 0 ... domingo = 6, sobre el día calendario (mediodía UTC: sin desfase de zona)
  const mondayIndex = (key: string) => (new Date(`${key}T12:00:00Z`).getUTCDay() + 6) % 7;
  const cells: (CalendarDay | null)[] = Array.from({ length: mondayIndex(days[0].date) }, () => null);
  cells.push(...days);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (CalendarDay | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/**
 * Racha actual (solo visualización; nunca llega a la API, al puntaje ni al ranking): desde hoy hacia
 * atrás, los días consecutivos con actividad pendiente o validada. Los descansos se saltan, hoy sin
 * actividad no la rompe (el día sigue abierto) y un día rechazado o válido sin registro la termina.
 */
export function currentStreak(days: CalendarDay[], today: string): number {
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const day = days[i];
    if (day.date > today) continue;
    const state = dayState(day, today);
    if (state === 'REST' || state === 'TODAY_OPEN') continue;
    if (state === 'PENDING' || state === 'VALIDATED') streak++;
    else break;
  }
  return streak;
}
