/**
 * Pruebas de los pasos del build de producción del servicio único.
 *   node --test scripts/lib/build-steps.test.mjs
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildSteps } from './build-steps.mjs';

const steps = buildSteps({ NEXT_PUBLIC_API_URL: '/api', API_INTERNAL_URL: 'http://127.0.0.1:3001' });
const backendCmds = () => steps.filter((s) => s.dir === 'backend').map((s) => s.cmd);

describe('pasos del build de producción', () => {
  it('los dos npm ci instalan las devDependencies aunque NODE_ENV=production', () => {
    const installs = steps.filter((s) => /^npm ci\b/.test(s.cmd));
    assert.deepEqual(
      installs.map((s) => s.dir),
      ['backend', 'frontend'],
    );
    for (const s of installs) assert.match(s.cmd, /--include=dev/);
  });

  it('cada npm ci va antes de su compilación y el prune --omit=dev después', () => {
    for (const dir of ['backend', 'frontend']) {
      const own = steps.filter((s) => s.dir === dir).map((s) => s.cmd);
      const ci = own.findIndex((c) => c.startsWith('npm ci'));
      const build = own.findIndex((c) => c === 'npm run build' || c === 'npx next build');
      const prune = own.findIndex((c) => c.startsWith('npm prune --omit=dev'));
      assert.ok(ci >= 0 && ci < build && build < prune, `${dir}: ${own.join(' | ')}`);
    }
  });

  it('el next build recibe las variables de la web y los demás pasos no', () => {
    const next = steps.find((s) => s.cmd === 'npx next build');
    assert.equal(next.env.API_INTERNAL_URL, 'http://127.0.0.1:3001');
    assert.equal(steps.filter((s) => s.env).length, 1);
  });

  it('compila el seed de producción antes de podar las devDependencies', () => {
    const c = backendCmds();
    const seed = c.findIndex((x) => x.includes('build:seed'));
    const prune = c.findIndex((x) => x.includes('npm prune --omit=dev'));
    assert.ok(seed >= 0, 'falta el paso que compila el seed');
    assert.ok(prune >= 0, 'falta la poda de devDependencies');
    assert.ok(seed < prune, 'el seed debe compilarse antes de la poda (tsc es devDependency)');
  });

  it('el seed se compila después del nest build y de prisma generate', () => {
    const c = backendCmds();
    const seed = c.findIndex((x) => x.includes('build:seed'));
    assert.ok(c.findIndex((x) => x === 'npx prisma generate') < seed);
    assert.ok(c.findIndex((x) => x === 'npm run build') < seed);
  });

  it('conserva npm ci, prisma generate, nest build y la poda del backend', () => {
    assert.deepEqual(backendCmds(), [
      'npm ci --include=dev --no-audit --no-fund',
      'npx prisma generate',
      'npm run build',
      'npm run build:seed',
      'npm prune --omit=dev --no-audit --no-fund',
    ]);
  });
});
