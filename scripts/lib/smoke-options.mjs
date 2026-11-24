/**
 * Argumentos y resumen de scripts/single-service-smoke.mjs. Funciones puras, probadas en
 * smoke-options.test.mjs.
 */

/**
 * @param {string[]} argv argumentos sin `node` ni el script
 * @returns {{ base: string, skipLimit: boolean } | { error: string }}
 */
export function parseSmokeArgs(argv) {
  const usage = 'Uso: node scripts/single-service-smoke.mjs <url-base> [--skip-limit]   (ej.: http://localhost:3000)';
  let skipLimit = false;
  let base;
  for (const arg of argv) {
    if (arg === '--skip-limit') skipLimit = true;
    else if (arg.startsWith('--')) return { error: `Opción desconocida: ${arg}\n${usage}` };
    else if (base === undefined) base = arg;
    else return { error: usage };
  }
  if (!base || !/^https?:\/\//.test(base)) return { error: usage };
  return { base: base.replace(/\/+$/, ''), skipLimit };
}

/** Texto del resumen cuando hubo comprobaciones omitidas; vacío si no se omitió ninguna. */
export function skippedSummary(count) {
  if (count <= 0) return '';
  return `${count} comprobaciones OMITIDAS con --skip-limit: el límite de login NO se verificó (pruébalo con dos redes distintas, ver el runbook).`;
}
