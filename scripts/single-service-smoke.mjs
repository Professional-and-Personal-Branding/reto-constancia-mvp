#!/usr/bin/env node
/**
 * Prueba de humo del servicio único contra una URL ya desplegada (local en Docker o Seenode).
 *
 *   node scripts/single-service-smoke.mjs http://localhost:3000
 *   node scripts/single-service-smoke.mjs https://<servicio>.seenode.app --skip-limit
 *
 * Comprueba: la página (/), /api/health y /api/health/db, Swagger apagado (404), una ruta
 * protegida sin sesión (401), las cabeceras de seguridad de la web y los límites de login por
 * cliente con X-Forwarded-For (el script hace de borde de la plataforma):
 *   - seis logins de un cliente → el sexto da 429;
 *   - otro cliente, justo después, no da 429 (con TRUST_PROXY=0 todos compartirían cupo);
 *   - una entrada falsa a la izquierda de X-Forwarded-For no cambia al cliente (con
 *     TRUST_PROXY=2 el límite se evade).
 * Usa solo una cuenta inexistente; nunca toca cuentas reales. Contra Seenode el borde ya añade la
 * IP real, así que los casos de límite se prueban con dos redes distintas (ver el runbook).
 * Opción --skip-limit: omite los tres casos del límite de login (los que envían logins repetidos y
 * dependen de un X-Forwarded-For falsificado). Úsala detrás del borde real de Seenode: allí todas las
 * peticiones salen de la misma IP, el caso "otro cliente" falla y la IP queda en 429 un minuto. El
 * resumen indica cuántas comprobaciones se omitieron y que el límite NO se verificó.
 * Sale con 0 e imprime OK, o con 1 y la lista de comprobaciones fallidas. Cada corrida usa
 * direcciones de documentación (RFC 5737) al azar para no chocar con la anterior.
 */
import { buildLimitCases } from './lib/smoke-limit-cases.mjs';
import { parseSmokeArgs, skippedSummary } from './lib/smoke-options.mjs';

const parsed = parseSmokeArgs(process.argv.slice(2));
if ('error' in parsed) {
  console.error(parsed.error);
  process.exit(2);
}
const { base, skipLimit } = parsed;

const failures = [];
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : detail ? `  ->  ${detail}` : ''}`);
  if (!ok) failures.push(name);
}

async function get(path, headers = {}) {
  return fetch(`${base}${path}`, { headers, redirect: 'manual' });
}

function login(xff) {
  return fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': xff },
    body: JSON.stringify({ email: 'humo-inexistente@example.invalid', password: 'no-es-una-clave-real' }),
  });
}

const octet = () => 1 + Math.floor(Math.random() * 254);
const clientA = `203.0.113.${octet()}`;
let clientB = `203.0.113.${octet()}`;
while (clientB === clientA) clientB = `203.0.113.${octet()}`;
const forged = `198.51.100.${octet()}`;
const limitCases = buildLimitCases({ login, clientA, clientB, forged });

console.log(`Servicio único · prueba de humo · ${base}`);

try {
  const home = await get('/');
  check('GET / responde 200', home.status === 200, `status ${home.status}`);

  const health = await get('/api/health');
  check('GET /api/health responde 200', health.status === 200, `status ${health.status}`);
  check('GET /api/health/db responde 200', (await get('/api/health/db')).status === 200);
  check('GET /api/docs responde 404 (Swagger apagado)', (await get('/api/docs')).status === 404);
  check('una ruta protegida sin sesión responde 401', (await get('/api/challenges')).status === 401);

  const h = home.headers;
  check(
    'la web envía Strict-Transport-Security',
    h.get('strict-transport-security') === 'max-age=15552000; includeSubDomains',
    String(h.get('strict-transport-security')),
  );
  check('la web envía X-Frame-Options DENY', h.get('x-frame-options') === 'DENY');
  check('la web envía X-Content-Type-Options nosniff', h.get('x-content-type-options') === 'nosniff');
  check('la web envía Referrer-Policy', h.get('referrer-policy') === 'strict-origin-when-cross-origin');
  const csp = h.get('content-security-policy') ?? '';
  check(
    'la web envía la CSP de anti-framing',
    ["frame-ancestors 'none'", "base-uri 'self'", "object-src 'none'", "form-action 'self'"].every((d) =>
      csp.includes(d),
    ),
    csp,
  );
  check('la web no envía X-Powered-By', h.get('x-powered-by') === null);
  const ah = health.headers;
  check(
    'las cabeceras de la API no se duplican',
    ah.get('x-content-type-options') === 'nosniff' && !(ah.get('strict-transport-security') ?? '').includes(','),
  );
  check('la respuesta de la API conserva su X-Request-Id', !!ah.get('x-request-id'));

  // Límite de login por cliente. El sexto intento del mismo cliente da 429.
  if (skipLimit) console.log(`  SKIP  ${limitCases.length} comprobaciones del límite de login (--skip-limit)`);
  else {
  for (const c of limitCases) await c.run(check);
  }
} catch (err) {
  check('el servicio responde', false, err instanceof Error ? err.message : String(err));
}

if (failures.length) {
  console.log(`\nFALLO: ${failures.length} comprobación(es):`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log(skipLimit ? `\nOK. ${skippedSummary(limitCases.length)}` : '\nOK');
