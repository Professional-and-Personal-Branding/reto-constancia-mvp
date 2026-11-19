/**
 * Configuración de despliegue de la web, compartida por next.config.mjs y las pruebas.
 * Es .mjs porque next.config.mjs lo importa antes de que Next compile nada.
 *
 * Servicio único (spec platform-operations): la web atiende el puerto público y reenvía /api/*
 * a la API por loopback, así que el navegador usa el mismo origen. Todo es opcional: sin
 * API_INTERNAL_URL (desarrollo, CI, dos servicios) no cambia nada.
 */

/** Rutas de páginas: todo salvo /api, cuyas respuestas ya traen las cabeceras de helmet. */
export const SECURITY_HEADERS_SOURCE = '/((?!api/).*)';

/**
 * Reescritura de /api hacia la API; vacía si no hay API_INTERNAL_URL (se lee al compilar).
 * @param {Record<string, string | undefined>} env
 */
export function apiRewrites(env) {
  const internal = env.API_INTERNAL_URL?.trim().replace(/\/+$/, '');
  if (!internal) return [];
  return [{ source: '/api/:path*', destination: `${internal}/api/:path*` }];
}

/** Cabeceras de seguridad de las páginas (diseño D6). No limitan scripts, estilos ni imágenes. */
export function securityHeaders() {
  return [
    {
      source: SECURITY_HEADERS_SOURCE,
      headers: [
        { key: 'Strict-Transport-Security', value: 'max-age=15552000; includeSubDomains' },
        { key: 'X-Frame-Options', value: 'DENY' },
        {
          key: 'Content-Security-Policy',
          value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
        },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      ],
    },
  ];
}

/**
 * Base de la API según dónde corre el código. En el navegador es NEXT_PUBLIC_API_URL (puede ser
 * "/api"). En el servidor de Next una ruta relativa no sirve: se usa API_INTERNAL_URL, y si no
 * existe y la pública es relativa, falla en vez de llamar a ninguna parte.
 * @param {{ server?: boolean, env?: Record<string, string | undefined> }} [options]
 */
export function apiBaseUrl({ server = false, env = process.env } = {}) {
  const publicUrl = env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api';
  if (!server) return publicUrl;
  const internal = env.API_INTERNAL_URL?.trim().replace(/\/+$/, '');
  if (internal) return `${internal}/api`;
  if (/^https?:\/\//.test(publicUrl)) return publicUrl;
  throw new Error('El código del servidor necesita API_INTERNAL_URL: NEXT_PUBLIC_API_URL es relativa.');
}
