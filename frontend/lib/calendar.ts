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
