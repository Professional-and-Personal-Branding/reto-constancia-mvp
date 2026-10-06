/**
 * Reporte de archivos huérfanos (cambio upload-asset-cleanup): archivos guardados que ninguna
 * foto de actividad ni comprobante de pago referencia. Solo lee: no tiene opción de borrado;
 * qué hacer con cada archivo lo decide una persona (runbook, mantenimiento mensual).
 *
 * Uso:
 *   node scripts/cloudinary-orphans.mjs           # Cloudinary (necesita CLOUDINARY_*)
 *   node scripts/cloudinary-orphans.mjs --local   # carpeta backend/uploads (modo dev)
 *   node scripts/cloudinary-orphans.mjs --json    # salida en JSON (para pruebas o planillas)
 *
 * Las variables salen del entorno o, si no están definidas, de backend/.env (DATABASE_URL,
 * CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, CLOUDINARY_FOLDER).
 * Categorías: activity, payment-proof o legacy (id que no sigue <base>/<reto>/<usuario>/<uso>/).
 */
import { existsSync, readFileSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BACKEND = join(ROOT, 'backend');
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

const args = new Set(process.argv.slice(2));
const LOCAL = args.has('--local');
const JSON_OUT = args.has('--json');

/** Variables de backend/.env; el entorno manda (una variable definida aunque vacía gana). */
function loadEnv() {
  const env = {};
  const file = join(BACKEND, '.env');
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  for (const [k, v] of Object.entries(process.env)) env[k] = v;
  return env;
}

function category(id, base) {
  const m = id.match(new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/${UUID}/${UUID}/(activity|payment-proof)/`));
  return m ? m[1] : 'legacy';
}

async function referencedIds(env, requireBackend) {
  const { PrismaClient } = requireBackend('@prisma/client');
  const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
  try {
    const [photos, proofs] = await Promise.all([
      prisma.activityPhoto.findMany({ select: { cloudinaryId: true } }),
      prisma.challengeParticipant.findMany({
        where: { paymentProofCloudinaryId: { not: null } },
        select: { paymentProofCloudinaryId: true },
      }),
    ]);
    return new Set([...photos.map((p) => p.cloudinaryId), ...proofs.map((p) => p.paymentProofCloudinaryId)]);
  } finally {
    await prisma.$disconnect();
  }
}

async function localAssets(base) {
  const uploads = join(BACKEND, 'uploads');
  const root = join(uploads, ...base.split('/'));
  const out = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (e) {
      if (e.code === 'ENOENT') return;
      throw e;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) {
        const info = await stat(path);
        const rel = relative(uploads, path).split(sep).join('/');
        out.push({ id: rel.slice(0, rel.length - extname(rel).length), bytes: info.size, createdAt: info.mtime.toISOString() });
      }
    }
  }
  await walk(root);
  return out;
}

async function cloudinaryAssets(cloudinary, base) {
  const out = [];
  let next_cursor;
  do {
    const page = await cloudinary.api.resources({
      type: 'upload', resource_type: 'image', prefix: `${base}/`, max_results: 500, next_cursor,
    });
    for (const r of page.resources) out.push({ id: r.public_id, bytes: r.bytes, createdAt: r.created_at });
    next_cursor = page.next_cursor;
  } while (next_cursor);
  return out;
}

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(2);

async function main() {
  const env = loadEnv();
  const base = (env.CLOUDINARY_FOLDER || 'reto-constancia').trim().replace(/^\/+|\/+$/g, '');
  const requireBackend = createRequire(join(BACKEND, 'package.json'));
  if (!env.DATABASE_URL) {
    console.error('Falta DATABASE_URL (ni en el entorno ni en backend/.env).');
    return 1;
  }

  let cloudinary;
  if (!LOCAL) {
    const { CLOUDINARY_CLOUD_NAME: cloud_name, CLOUDINARY_API_KEY: api_key, CLOUDINARY_API_SECRET: api_secret } = env;
    if (!cloud_name || !api_key || !api_secret) {
      console.error(
        'Faltan CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY o CLOUDINARY_API_SECRET. ' +
          'Defínelas para revisar Cloudinary, o usa --local para la carpeta backend/uploads.',
      );
      return 1;
    }
    cloudinary = requireBackend('cloudinary').v2;
    cloudinary.config({ cloud_name, api_key, api_secret, secure: true });
  }

  const [referenced, assets] = await Promise.all([
    referencedIds(env, requireBackend),
    LOCAL ? localAssets(base) : cloudinaryAssets(cloudinary, base),
  ]);
  const orphans = assets
    .filter((a) => !referenced.has(a.id))
    .map((a) => ({ ...a, category: category(a.id, base) }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const totalBytes = orphans.reduce((sum, a) => sum + a.bytes, 0);
  const usage = cloudinary ? await cloudinary.api.usage() : null;

  if (JSON_OUT) {
    console.log(JSON.stringify({ mode: LOCAL ? 'local' : 'cloudinary', base, scanned: assets.length, orphans, totalBytes, usage }, null, 2));
    return 0;
  }
  console.log(`Origen: ${LOCAL ? 'carpeta local backend/uploads' : 'Cloudinary'} · carpeta ${base}/`);
  console.log(`Archivos revisados: ${assets.length} · huérfanos: ${orphans.length} · ${mb(totalBytes)} MB`);
  if (orphans.length) {
    console.table(orphans.map((a) => ({ id: a.id, MB: mb(a.bytes), fecha: a.createdAt.slice(0, 10), categoria: a.category })));
  }
  if (usage) {
    const pct = usage.credits?.used_percent ?? usage.storage?.used_percent;
    console.log(`Uso de la cuenta: ${pct ?? '?'} % del plan (plan ${usage.plan ?? '?'})`);
  }
  console.log('Este reporte no borra nada: decide a mano qué archivos eliminar (runbook, mantenimiento mensual).');
  return 0;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(`No se pudo generar el reporte: ${e?.message ?? e}`);
    process.exit(1);
  },
);
