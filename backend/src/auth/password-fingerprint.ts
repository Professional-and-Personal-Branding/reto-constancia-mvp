import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Huella del hash de la contraseña: HMAC-SHA256 con el secreto del refresh, 22 caracteres base64url.
 * Va como `pwv` en el access token y en el refresh token; si el hash cambia, la huella cambia.
 */
export function passwordFingerprint(hash: string, secret: string): string {
  return createHmac('sha256', secret).update(hash).digest('base64url').slice(0, 22);
}

/** Compara en tiempo constante el `pwv` de un token con la huella del hash vigente. */
export function matchesFingerprint(claim: unknown, hash: string, secret: string): boolean {
  if (typeof claim !== 'string') return false;
  const expected = Buffer.from(passwordFingerprint(hash, secret));
  const received = Buffer.from(claim);
  return received.length === expected.length && timingSafeEqual(received, expected);
}
