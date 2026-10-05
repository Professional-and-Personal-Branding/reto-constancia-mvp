/**
 * Ajustes HTTP que dependen del entorno de despliegue.
 *
 * El limitador de peticiones identifica a cada cliente por su IP. Detrás de un proxy
 * (Seenode, Render, un balanceador), Express ve la IP del proxy salvo que se le indique
 * confiar en él: todos los usuarios compartirían un mismo cupo, y unos pocos bastarían para
 * dejar a la plataforma entera respondiendo 429.
 */
export interface HttpEnv {
  NODE_ENV?: string;
  TRUST_PROXY?: string;
  THROTTLE_LIMIT?: string;
  THROTTLE_TTL_MS?: string;
  SWAGGER_ENABLED?: string;
}

/**
 * Valor para `app.set('trust proxy', ...)`.
 * TRUST_PROXY acepta un número de saltos ("1"), "true"/"false" o una lista de IPs/subredes.
 * Sin configurar: un salto en producción (un proxy delante) y ninguno en desarrollo.
 */
export function resolveTrustProxy(env: HttpEnv): boolean | number | string {
  const raw = env.TRUST_PROXY?.trim();
  if (!raw) return env.NODE_ENV === 'production' ? 1 : false;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^\d+$/.test(raw)) return Number(raw);
  return raw;
}

/** Límite global por cliente. Por defecto 100 peticiones por minuto. */
export function resolveThrottle(env: HttpEnv): { ttl: number; limit: number } {
  const limit = Number(env.THROTTLE_LIMIT);
  const ttl = Number(env.THROTTLE_TTL_MS);
  return {
    limit: Number.isInteger(limit) && limit > 0 ? limit : 100,
    ttl: Number.isInteger(ttl) && ttl > 0 ? ttl : 60_000,
  };
}

/**
 * Swagger expone el mapa de los endpoints de administración. SWAGGER_ENABLED acepta
 * "true"/"false"; sin configurar, apagado en producción y encendido en desarrollo y pruebas.
 */
export function resolveSwaggerEnabled(env: HttpEnv): boolean {
  const raw = env.SWAGGER_ENABLED?.trim().toLowerCase();
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return env.NODE_ENV !== 'production';
}

/** Firmas de subida por cliente y minuto (spec upload-guardrails). Por defecto 30. */
export function resolveUploadSignLimit(env: { UPLOAD_SIGN_LIMIT?: string }): number {
  const limit = Number(env.UPLOAD_SIGN_LIMIT);
  return Number.isInteger(limit) && limit > 0 ? limit : 30;
}
