#!/usr/bin/env node
/**
 * Build de producción del servicio único (API + web), secuencial y con memoria acotada.
 *
 *   node scripts/build-prod.mjs        # también: npm run build en la raíz del repositorio
 *
 * 1. backend: npm ci, prisma generate, nest build, npm prune --omit=dev
 *    (prisma y @prisma/client son dependencias de ejecución: migrate deploy sigue funcionando)
 * 2. frontend: npm ci, next build con NEXT_PUBLIC_API_URL=/api y
 *    API_INTERNAL_URL=http://127.0.0.1:API_PORT (salvo que ya estén definidas), npm prune --omit=dev
 *    y borra los binarios SWC de la otra libc (glibc o musl) y frontend/.next/cache
 * 3. Imprime el tamaño en disco de backend/ y frontend/ (el plan tiene 750 MB).
 * Cada paso corre con NODE_OPTIONS=--max-old-space-size=BUILD_MAX_OLD_SPACE_MB (400) y un
 * paso que falla detiene todo con código distinto de cero.
 *
 * Variables opcionales: BUILD_MAX_OLD_SPACE_MB, API_PORT (3001), NEXT_PUBLIC_API_URL, API_INTERNAL_URL.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, lstatSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runtimeIsGlibc, swcDirsToPrune } from './lib/prune.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const heap = Number(process.env.BUILD_MAX_OLD_SPACE_MB);
const heapMb = Number.isInteger(heap) && heap > 0 ? heap : 400;
const apiPort = Number(process.env.API_PORT) > 0 ? Number(process.env.API_PORT) : 3001;

function nodeOptions() {
  const own = `--max-old-space-size=${heapMb}`;
  const current = process.env.NODE_OPTIONS?.replace(/--max-old-space-size=\d+/g, '').trim();
  return current ? `${current} ${own}` : own;
}

function step(label, cwd, cmd, extraEnv = {}) {
  console.log(`\n▶ ${label}`);
  const res = spawnSync(cmd, {
    cwd,
    shell: true,
    stdio: 'inherit',
    env: { ...process.env, NODE_OPTIONS: nodeOptions(), ...extraEnv },
  });
  if (res.status !== 0) {
    console.error(`\nFALLÓ: ${label} (código ${res.status ?? 'señal ' + res.signal})`);
    process.exit(res.status || 1);
  }
}

function sizeOf(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    total += entry.isDirectory() ? sizeOf(path) : lstatSync(path).size;
  }
  return total;
}

const BACKEND = join(ROOT, 'backend');
const FRONTEND = join(ROOT, 'frontend');
const webEnv = {
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || '/api',
  API_INTERNAL_URL: process.env.API_INTERNAL_URL || `http://127.0.0.1:${apiPort}`,
};

console.log(`Build del servicio único (heap ${heapMb} MB por paso)`);
step('backend · npm ci', BACKEND, 'npm ci --no-audit --no-fund');
step('backend · prisma generate', BACKEND, 'npx prisma generate');
step('backend · nest build', BACKEND, 'npm run build');
step('backend · npm prune --omit=dev', BACKEND, 'npm prune --omit=dev --no-audit --no-fund');
step('frontend · npm ci', FRONTEND, 'npm ci --no-audit --no-fund');
step(`frontend · next build (NEXT_PUBLIC_API_URL=${webEnv.NEXT_PUBLIC_API_URL})`, FRONTEND, 'npx next build', webEnv);
step('frontend · npm prune --omit=dev', FRONTEND, 'npm prune --omit=dev --no-audit --no-fund');

// Next instala los binarios SWC de glibc y de musl (137 MB cada uno) y `next start` no usa ninguno:
// se borran los de la otra libc y la caché del build, que no hacen falta para ejecutar.
{
  const glibc = runtimeIsGlibc();
  const nextScope = join(FRONTEND, 'node_modules', '@next');
  const names = existsSync(nextScope) ? readdirSync(nextScope) : [];
  const doomed = swcDirsToPrune(names, glibc).map((name) => join(nextScope, name));
  doomed.push(join(FRONTEND, '.next', 'cache'));
  console.log(`\n▶ frontend · poda de SWC de ${glibc ? 'musl' : 'gnu'} y de .next/cache`);
  for (const dir of doomed) rmSync(dir, { recursive: true, force: true });
}

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(0)} MB`;
console.log('\nTamaño en disco (el plan tiene 750 MB):');
console.log(`  backend/   ${mb(sizeOf(BACKEND))}`);
console.log(`  frontend/  ${mb(sizeOf(FRONTEND))}`);
console.log('\nBuild OK');
