/**
 * Datos de prueba: borra los retos que crean las suites de prueba, directo en la base local.
 *
 * Un reto cerrado es definitivo en la API (no se edita ni vuelve a borrador), así que las
 * herramientas de prueba que reutilizan un mes ya no pueden "reabrirlo": borran su propio reto
 * de prueba y lo crean de nuevo. Las participaciones, actividades, fotos y premiaciones se van
 * con él por las cascadas del esquema.
 *
 * Solo para pruebas: se niega a operar si DATABASE_URL no apunta a una base local, y solo borra
 * los pares mes/año que recibe.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BACKEND = join(ROOT, 'backend');
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** DATABASE_URL del entorno o, si no está, la de backend/.env. */
export function databaseUrl(env = process.env) {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  const file = join(BACKEND, '.env');
  if (!existsSync(file)) throw new Error('test-db: falta DATABASE_URL (ni en el entorno ni en backend/.env)');
  const line = readFileSync(file, 'utf8').split(/\r?\n/).find((l) => /^\s*DATABASE_URL\s*=/.test(l));
  if (!line) throw new Error('test-db: backend/.env no define DATABASE_URL');
  return line.replace(/^\s*DATABASE_URL\s*=\s*/, '').trim().replace(/^["']|["']$/g, '');
}

/** Lanza un error si la base no es local: este helper nunca debe tocar una base real. */
export function assertLocalDatabase(url) {
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error('test-db: DATABASE_URL no es una URL válida');
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`test-db: la base "${host}" no es local; este helper solo borra datos de prueba en una base local`);
  }
}

/**
 * Borra los retos de prueba de los meses indicados (y todo lo que cuelga de ellos).
 * @param {{ month: number, year: number }[]} pairs
 * @returns {Promise<number>} cantidad de retos borrados
 */
export async function deleteTestChallenges(pairs) {
  const url = databaseUrl();
  assertLocalDatabase(url);
  const { PrismaClient } = createRequire(join(BACKEND, 'package.json'))('@prisma/client');
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    let deleted = 0;
    for (const { month, year } of pairs) {
      const result = await prisma.challenge.deleteMany({ where: { month, year } });
      deleted += result.count;
    }
    return deleted;
  } finally {
    await prisma.$disconnect();
  }
}
