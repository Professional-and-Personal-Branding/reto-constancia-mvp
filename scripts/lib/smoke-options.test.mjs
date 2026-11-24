/**
 * Pruebas de los argumentos y del resumen de la prueba de humo del servicio único.
 *   node --test scripts/lib/smoke-options.test.mjs
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseSmokeArgs, skippedSummary } from './smoke-options.mjs';

describe('argumentos de la prueba de humo', () => {
  it('sin flags conserva el comportamiento por omisión: URL sin barra final y límite verificado', () => {
    assert.deepEqual(parseSmokeArgs(['http://localhost:3000/']), {
      base: 'http://localhost:3000',
      skipLimit: false,
    });
  });

  it('--skip-limit omite el límite de login antes o después de la URL', () => {
    assert.equal(parseSmokeArgs(['--skip-limit', 'https://x.seenode.app']).skipLimit, true);
    assert.equal(parseSmokeArgs(['https://x.seenode.app', '--skip-limit']).skipLimit, true);
  });

  it('una URL inválida, ausente o un flag desconocido dan error de uso', () => {
    assert.ok(parseSmokeArgs([]).error);
    assert.ok(parseSmokeArgs(['localhost:3000']).error);
    assert.ok(parseSmokeArgs(['http://localhost:3000', '--nope']).error);
  });

  it('el resumen de omitidos dice cuántos fueron y que el límite NO se verificó; sin omitir no dice nada', () => {
    const text = skippedSummary(3);
    assert.match(text, /3 comprobaci/);
    assert.match(text, /NO se verific/);
    assert.equal(skippedSummary(0), '');
  });
});
