/**
 * Fechas de día calendario.
 *
 * El backend guarda los días de actividad y el período del reto como `date` de Postgres
 * (`@db.Date`) y los serializa a medianoche UTC: `2026-12-27T00:00:00.000Z`. Formatear ese
 * valor con la zona horaria del navegador corre el día hacia atrás en cualquier zona al
 * oeste de UTC (en UTC-4 el 27 se veía como "26 dic"). Estas funciones trabajan siempre
 * sobre el día calendario, sin desfase.
 */

/** Día calendario `YYYY-MM-DD` de una fecha del backend. */
export function toDayKey(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Hoy según el calendario **local** del usuario.
 * `new Date().toISOString()` daría la fecha UTC, que de noche en América ya es el día siguiente.
 */
export function isoToday(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

const DEFAULT_OPTIONS: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' };

/** Formatea un día calendario en es-BO sin que la zona horaria cambie el día mostrado. */
export function formatDay(
  iso: string,
  options: Intl.DateTimeFormatOptions = DEFAULT_OPTIONS,
): string {
  // Mediodía UTC + timeZone UTC: el día mostrado es siempre el del propio valor
  return new Date(`${toDayKey(iso)}T12:00:00.000Z`).toLocaleDateString('es-BO', {
    ...options,
    timeZone: 'UTC',
  });
}
