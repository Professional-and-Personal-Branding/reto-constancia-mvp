#!/usr/bin/env node
/**
 * Arranque del servicio único: API y web en un mismo contenedor (Seenode Web Service).
 *
 *   node scripts/start-prod.mjs        # también: npm start en la raíz del repositorio
 *
 * Orden: prisma migrate deploy → API en 127.0.0.1:API_PORT (3001) → espera /api/health →
 * web en 0.0.0.0:PORT (3000). Si cualquiera de los dos procesos termina, detiene al otro y
 * sale distinto de cero para que la plataforma reinicie el servicio. SIGTERM/SIGINT se
 * reenvían a ambos (la API cierra la conexión a la base) con 10 s de gracia.
 *
 * Variables (todas opcionales):
 *   PORT                    puerto público de la web (3000)
 *   API_PORT                puerto de la API en loopback (3001)
 *   API_MAX_OLD_SPACE_MB    tope del heap de la API (224)
 *   WEB_MAX_OLD_SPACE_MB    tope del heap de la web (160)
 *   TRUST_PROXY             saltos de proxy para la IP del cliente; sin definir se usa 1
 *                           (el borde de la plataforma: el proxy de Next reenvía
 *                           X-Forwarded-For sin añadir su propio salto)
 * La web no recibe DATABASE_URL, JWT_*, CLOUDINARY_API_SECRET ni SEED_*.
 * Exige haber corrido antes npm run build (scripts/build-prod.mjs).
 * La lógica está en scripts/lib/supervisor.mjs, con pruebas en supervisor.test.mjs.
 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { buildConfig, connectionLimitWarning, startSupervisor } from './lib/supervisor.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

if (!existsSync(join(ROOT, 'backend', 'dist', 'main.js')) || !existsSync(join(ROOT, 'frontend', '.next'))) {
  console.error('[supervisor] Falta el build: corre npm run build antes de arrancar.');
  process.exit(1);
}

const warning = connectionLimitWarning(process.env);
if (warning) console.warn(`[supervisor] ${warning}`);

const supervisor = startSupervisor(buildConfig(process.env, ROOT));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => supervisor.shutdown(signal));
supervisor.done.then((code) => process.exit(code));
