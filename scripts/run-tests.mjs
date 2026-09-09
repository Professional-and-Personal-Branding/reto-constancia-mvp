#!/usr/bin/env node
/**
 * Corredor único de la batería automatizada de la plataforma.
 *
 *   node scripts/run-tests.mjs              # todo (unit + build + e2e + sesiones paralelas)
 *   node scripts/run-tests.mjs --quick      # solo lo que no necesita base de datos
 *   node scripts/run-tests.mjs --skip-e2e   # sin e2e (útil si no hay Postgres a mano)
 *   node scripts/run-tests.mjs --skip-build # sin builds (iteración rápida)
 *   node scripts/run-tests.mjs --list       # muestra los pasos y sale
 *
 * Requisitos: Node >= 20, dependencias instaladas en backend/ y frontend/.
 * Los pasos que necesitan Postgres o una API corriendo se saltan con aviso si no están
 * disponibles, para que el comando siga siendo útil en cualquier entorno.
 * Ver docs/testing.md para el detalle de cada suite.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BACKEND = join(ROOT, 'backend');
const FRONTEND = join(ROOT, 'frontend');
const API_URL = process.env.API_URL ?? 'http://localhost:3002/api';

const args = new Set(process.argv.slice(2));
const QUICK = args.has('--quick');
const SKIP_E2E = args.has('--skip-e2e') || QUICK;
const SKIP_BUILD = args.has('--skip-build');

/** needs: 'db' → requiere Postgres · 'api' → requiere la API corriendo */
const STEPS = [
  { id: 'backend:lint', label: 'Backend · lint (ESLint)', cwd: BACKEND, cmd: 'npm run lint' },
  { id: 'backend:unit', label: 'Backend · pruebas unitarias (Jest)', cwd: BACKEND, cmd: 'npx jest --silent' },
  { id: 'backend:build', label: 'Backend · build (nest build)', cwd: BACKEND, cmd: 'npm run build', skip: SKIP_BUILD },
  { id: 'backend:migrate', label: 'Backend · migraciones (prisma migrate deploy)', cwd: BACKEND, cmd: 'npx prisma migrate deploy', needs: 'db', skip: SKIP_E2E },
  { id: 'backend:e2e', label: 'Backend · pruebas e2e (Jest + supertest + Postgres)', cwd: BACKEND, cmd: 'npm run test:e2e', needs: 'db', skip: SKIP_E2E },
  { id: 'frontend:types', label: 'Frontend · tipos (tsc --noEmit)', cwd: FRONTEND, cmd: 'npx tsc --noEmit -p .' },
  { id: 'frontend:lint', label: 'Frontend · lint (next lint)', cwd: FRONTEND, cmd: 'npm run lint' },
  { id: 'frontend:build', label: 'Frontend · build (next build)', cwd: FRONTEND, cmd: 'npm run build', skip: SKIP_BUILD },
  { id: 'e2e:sessions', label: 'Plataforma · sesiones paralelas contra la API', cwd: ROOT, cmd: 'node scripts/parallel-session-test.mjs', needs: 'api' },
];

function run(cmd, cwd) {
  const started = Date.now();
  const res = spawnSync(cmd, { cwd, shell: true, encoding: 'utf8' });
  const output = `${res.stdout ?? ''}${res.stderr ?? ''}`;
  return { ok: res.status === 0, output, ms: Date.now() - started };
}

async function apiIsUp() {
  try {
    const res = await fetch(`${API_URL.replace(/\/$/, '')}/health`, {
      signal: AbortSignal.timeout(2500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function dbIsUp() {
  // `prisma migrate status` sale != 0 si no puede conectar (también si faltan migraciones,
  // pero en ese caso el mensaje lo dice y el paso de migrate lo resuelve).
  const res = spawnSync('npx prisma migrate status', { cwd: BACKEND, shell: true, encoding: 'utf8' });
  const out = `${res.stdout ?? ''}${res.stderr ?? ''}`;
  return !/P1001|Can't reach database server|could not connect/i.test(out);
}

function fmt(ms) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

async function main() {
  if (args.has('--list')) {
    for (const s of STEPS) console.log(`${s.id.padEnd(18)} ${s.label}${s.needs ? `  [necesita ${s.needs}]` : ''}`);
    return 0;
  }

  for (const dir of [BACKEND, FRONTEND]) {
    if (!existsSync(join(dir, 'node_modules'))) {
      console.error(`Faltan dependencias en ${dir}. Corre: cd ${dir} && npm install`);
      return 1;
    }
  }

  const needsDb = STEPS.some((s) => !s.skip && s.needs === 'db');
  const hasDb = needsDb ? dbIsUp() : false;
  const needsApi = STEPS.some((s) => !s.skip && s.needs === 'api');
  const hasApi = needsApi ? await apiIsUp() : false;

  console.log('Batería automatizada · Reto de Constancia');
  console.log(`  Postgres: ${needsDb ? (hasDb ? 'disponible' : 'NO disponible → e2e se salta') : 'no requerido'}`);
  console.log(`  API (${API_URL}): ${needsApi ? (hasApi ? 'arriba' : 'abajo → sesiones paralelas se salta') : 'no requerida'}`);
  console.log('');

  const results = [];
  for (const step of STEPS) {
    if (step.skip) {
      results.push({ ...step, state: 'omitido', reason: 'por flag' });
      continue;
    }
    if (step.needs === 'db' && !hasDb) {
      results.push({ ...step, state: 'saltado', reason: 'sin Postgres (docker compose up -d postgres)' });
      continue;
    }
    if (step.needs === 'api' && !hasApi) {
      results.push({ ...step, state: 'saltado', reason: `sin API en ${API_URL} (npm run start:dev)` });
      continue;
    }

    process.stdout.write(`▶  ${step.label} … `);
    const { ok, output, ms } = run(step.cmd, step.cwd);
    console.log(ok ? `OK (${fmt(ms)})` : `FALLÓ (${fmt(ms)})`);
    if (!ok) console.log(output.split('\n').slice(-25).join('\n'));
    results.push({ ...step, state: ok ? 'ok' : 'fallo', ms });
  }

  console.log('\nResumen');
  for (const r of results) {
    const mark = r.state === 'ok' ? 'PASS' : r.state === 'fallo' ? 'FAIL' : 'SKIP';
    const extra = r.state === 'ok' ? fmt(r.ms) : (r.reason ?? '');
    console.log(`  ${mark}  ${r.label}${extra ? `  ·  ${extra}` : ''}`);
  }

  const failed = results.filter((r) => r.state === 'fallo');
  const skipped = results.filter((r) => r.state === 'saltado' || r.state === 'omitido');
  console.log(
    `\n  ${results.length - failed.length - skipped.length} OK · ${failed.length} fallidos · ${skipped.length} sin ejecutar`,
  );
  return failed.length > 0 ? 1 : 0;
}

main().then((code) => process.exit(code));
