import type { AuthTokens } from './types';

/** Mensajes y reglas puras de "Mi cuenta" (spec account-self-service). */
export const RATE_LIMIT_MESSAGE = 'Demasiados intentos. Espera un minuto e inténtalo de nuevo.';
export const FALLBACK_MESSAGE = 'No se pudo guardar. Inténtalo de nuevo.';
export const MISMATCH_MESSAGE = 'Las contraseñas no coinciden';

/** Traduce un error de la API al texto que se muestra junto al formulario. */
export function accountErrorMessage(status: number, body: unknown): string {
  if (status === 429) return RATE_LIMIT_MESSAGE;
  const message = (body as { message?: unknown } | null)?.message;
  if (typeof message === 'string' && message.trim()) return message;
  if (Array.isArray(message) && typeof message[0] === 'string' && message[0].trim()) return message[0];
  return FALLBACK_MESSAGE;
}

/** La confirmación debe coincidir exactamente con la contraseña nueva. */
export function passwordsMatch(next: string, confirmation: string): boolean {
  return next === confirmation;
}

/**
 * Qué hacer cuando el servidor rechaza un refresh token (spec: un refresh rechazado no descarta
 * tokens más nuevos). Si los guardados ya son otros (p. ej. otra pestaña cambió la contraseña
 * mientras tanto) se conservan y se continúa con ellos; si siguen siendo los rechazados, o ya no
 * hay sesión guardada, se cierra la sesión.
 */
export function afterRefreshRejected(stored: AuthTokens | null, rejectedRefreshToken: string): 'clear' | 'retry' {
  if (stored && stored.refreshToken !== rejectedRefreshToken) return 'retry';
  return 'clear';
}
