/**
 * Pruebas de los pasos del build de producción del backend.
 *   node --test scripts/lib/build-steps.test.mjs
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { backendSteps } from './build-steps.mjs';

const cmds = () => backendSteps().map((s) => s.cmd);

describe('pasos del build del backend', () => {
  it('compila el seed de producción antes de podar las devDependencies', () => {
    const seed = cmds().findIndex((c) => c.includes('build:seed'));
    const prune = cmds().findIndex((c) => c.includes('npm prune --omit=dev'));
    assert.ok(seed >= 0, 'falta el paso que compila el seed');
    assert.ok(prune >= 0, 'falta la poda de devDependencies');
    assert.ok(seed < prune, 'el seed debe compilarse antes de la poda (tsc es devDependency)');
  });

  it('el seed se compila después del nest build y de prisma generate', () => {
    const c = cmds();
    const seed = c.findIndex((x) => x.includes('build:seed'));
    assert.ok(c.findIndex((x) => x === 'npx prisma generate') < seed);
    assert.ok(c.findIndex((x) => x === 'npm run build') < seed);
  });

  it('conserva npm ci, prisma generate, nest build y la poda', () => {
    assert.deepEqual(cmds(), [
      'npm ci --no-audit --no-fund',
      'npx prisma generate',
      'npm run build',
      'npm run build:seed',
      'npm prune --omit=dev --no-audit --no-fund',
    ]);
  });
});
