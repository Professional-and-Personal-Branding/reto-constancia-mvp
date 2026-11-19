/**
 * Pruebas de la configuración de despliegue de la web (servicio único): proxy /api,
 * cabeceras de seguridad y base de la API según dónde corra el código.
 *   npm test
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apiBaseUrl, apiRewrites, securityHeaders, SECURITY_HEADERS_SOURCE } from './deploy-config.mjs';

test('sin API_INTERNAL_URL no hay reescritura de /api', () => {
  assert.deepEqual(apiRewrites({}), []);
  assert.deepEqual(apiRewrites({ API_INTERNAL_URL: '' }), []);
  assert.deepEqual(apiRewrites({ API_INTERNAL_URL: '   ' }), []);
});

test('con API_INTERNAL_URL hay una sola regla /api/:path* hacia la API', () => {
  assert.deepEqual(apiRewrites({ API_INTERNAL_URL: 'http://127.0.0.1:3001' }), [
    { source: '/api/:path*', destination: 'http://127.0.0.1:3001/api/:path*' },
  ]);
  assert.deepEqual(apiRewrites({ API_INTERNAL_URL: 'http://127.0.0.1:3001/' }), [
    { source: '/api/:path*', destination: 'http://127.0.0.1:3001/api/:path*' },
  ]);
});

test('las cabeceras de seguridad son las cinco del diseño y excluyen /api', () => {
  const [rule] = securityHeaders();
  assert.equal(rule.source, SECURITY_HEADERS_SOURCE);
  assert.equal(rule.source, '/((?!api/).*)');
  const byKey = Object.fromEntries(rule.headers.map((h: { key: string; value: string }) => [h.key, h.value]));
  assert.deepEqual(Object.keys(byKey).sort(), [
    'Content-Security-Policy',
    'Referrer-Policy',
    'Strict-Transport-Security',
    'X-Content-Type-Options',
    'X-Frame-Options',
  ]);
  assert.equal(byKey['Strict-Transport-Security'], 'max-age=15552000; includeSubDomains');
  assert.equal(byKey['X-Frame-Options'], 'DENY');
  assert.equal(byKey['X-Content-Type-Options'], 'nosniff');
  assert.equal(byKey['Referrer-Policy'], 'strict-origin-when-cross-origin');
  assert.equal(
    byKey['Content-Security-Policy'],
    "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
  );
});

test('la regla de cabeceras alcanza a las páginas y no a /api', () => {
  const re = new RegExp(`^${SECURITY_HEADERS_SOURCE}$`);
  for (const path of ['/', '/login', '/dashboard/admin', '/_next/static/x.js']) assert.ok(re.test(path), path);
  for (const path of ['/api/health', '/api/auth/login']) assert.equal(re.test(path), false, path);
});

test('apiBaseUrl en el navegador usa NEXT_PUBLIC_API_URL tal cual (puede ser relativa)', () => {
  assert.equal(apiBaseUrl({ env: { NEXT_PUBLIC_API_URL: '/api' } }), '/api');
  assert.equal(apiBaseUrl({ env: {} }), 'http://localhost:3000/api');
});

test('apiBaseUrl en el servidor nunca devuelve una URL relativa', () => {
  assert.equal(
    apiBaseUrl({ server: true, env: { NEXT_PUBLIC_API_URL: '/api', API_INTERNAL_URL: 'http://127.0.0.1:3001' } }),
    'http://127.0.0.1:3001/api',
  );
  assert.equal(
    apiBaseUrl({ server: true, env: { NEXT_PUBLIC_API_URL: 'https://api.ejemplo.com/api' } }),
    'https://api.ejemplo.com/api',
  );
  assert.throws(() => apiBaseUrl({ server: true, env: { NEXT_PUBLIC_API_URL: '/api' } }), /API_INTERNAL_URL/);
});
