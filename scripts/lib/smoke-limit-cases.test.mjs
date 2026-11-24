/**
 * Pruebas de las comprobaciones del límite de login de la prueba de humo.
 *   node --test scripts/lib/smoke-limit-cases.test.mjs
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildLimitCases } from './smoke-limit-cases.mjs';
import { skippedSummary } from './smoke-options.mjs';

describe('comprobaciones del límite de login', () => {
  it('el conteo de omitidos que informa el resumen sale de las comprobaciones reales del límite', async () => {
    let n = 0;
    const login = async () => ({ status: 401 });
    const cases = buildLimitCases({ login, clientA: 'a', clientB: 'b', forged: 'f' });
    const names = [];
    for (const c of cases) await c.run((name) => (n++, names.push(name)));
    assert.equal(cases.length, n);
    assert.deepEqual(
      names,
      cases.map((c) => c.name),
    );
    assert.match(skippedSummary(cases.length), new RegExp(`${n} comprobaci`));
  });
});
