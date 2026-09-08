/**
 * Resolución del origen permitido por CORS.
 *
 * La API se sirve con `credentials: true`, así que un comodín (`*`) además de ser inválido
 * para el navegador dejaría la API abierta a cualquier sitio. En producción, si no hay
 * `CORS_ORIGIN` configurado, se bloquea el acceso cruzado en vez de abrirlo.
 */
export type CorsOrigin = string[] | boolean;

export interface CorsEnv {
  CORS_ORIGIN?: string;
  NODE_ENV?: string;
}

export function resolveCorsOrigin(env: CorsEnv): CorsOrigin {
  const origins =
    env.CORS_ORIGIN?.split(',')
      .map((o) => o.trim().replace(/\/$/, ''))
      .filter(Boolean) ?? [];

  if (origins.length > 0) return origins;
  // Sin configuración: en dev se refleja el origen del navegador; en prod no se permite ninguno.
  return env.NODE_ENV !== 'production';
}

export function corsWarning(origin: CorsOrigin, env: CorsEnv): string | null {
  if (Array.isArray(origin)) return null;
  if (env.NODE_ENV === 'production') {
    return 'CORS_ORIGIN no está configurado: el navegador no podrá llamar a la API desde otro origen. Define CORS_ORIGIN con la URL del frontend.';
  }
  return 'CORS_ORIGIN no está configurado: se refleja el origen del navegador (solo apto para desarrollo).';
}
