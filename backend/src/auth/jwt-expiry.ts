import type { JwtSignOptions } from '@nestjs/jwt';

type ExpiresIn = NonNullable<JwtSignOptions['expiresIn']>;

// Formato que entiende jsonwebtoken (librería ms): un número de segundos, o cantidad y unidad
const DURATION =
  /^\d+(\.\d+)?\s*(ms|msecs?|milliseconds?|s|secs?|seconds?|m|mins?|minutes?|h|hrs?|hours?|d|days?|w|weeks?|y|yrs?|years?)$/i;

/**
 * Vigencia de un token a partir de la configuración. Un valor mal escrito hace fallar el
 * arranque con un mensaje claro, en vez de emitir tokens con una vigencia inesperada.
 */
export function jwtExpiresIn(raw: string | undefined, fallback: string, variable: string): ExpiresIn {
  const value = raw?.trim() || fallback;
  if (/^\d+$/.test(value)) return Number(value);
  if (!DURATION.test(value)) {
    throw new Error(`${variable}="${value}" no es una duración válida (ejemplos: 900, 15m, 12h, 7d)`);
  }
  return value as ExpiresIn;
}
