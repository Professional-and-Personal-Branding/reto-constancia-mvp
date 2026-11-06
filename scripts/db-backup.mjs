/**
 * Respaldo verificado de la base (cambio db-backup-verify): vuelca la base, restaura el volcado
 * en una base temporal LOCAL y compara las filas de cada tabla con el origen. Solo lee el origen
 * (pg_dump y SELECT count(*)) y solo crea/borra bases `reto_restore_check_<AAAAMMDDHHMMSS>`.
 *
 * Uso:
 *   node scripts/db-backup.mjs [--out <carpeta>] [--target <url>] [--tool auto|local|docker]
 *   node scripts/db-backup.mjs --file <volcado.dump>   # verifica un volcado hecho en otro lado
 *
 *   --out     carpeta de salida (por defecto backups/, ignorada por git)
 *   --target  URL de mantenimiento LOCAL donde se crea la base temporal
 *             (por defecto postgresql://postgres:postgres@localhost:5433/postgres)
 *   --tool    auto usa pg_dump/pg_restore/psql del PATH si existen y, si no, el contenedor
 *             reto-constancia-db con `docker exec`
 *   --file    restaura un volcado existente y muestra sus cuentas (sin comparación con el origen)
 *
 * El origen sale de DATABASE_URL (entorno o backend/.env). Ninguna URL va en la línea de comandos:
 * se pasa por variables PG* del entorno. Códigos de salida: 0 OK, 1 FALLO, 2 rechazado.
 */
import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLocalDatabase, databaseUrl } from './lib/test-db.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONTAINER = 'reto-constancia-db';
const DEFAULT_TARGET = 'postgresql://postgres:postgres@localhost:5433/postgres';
const TEMP_PREFIX = 'reto_restore_check_';
const TEMP_RE = /^reto_restore_check_\d{14}$/;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

class Refusal extends Error {}
class Failure extends Error {}

function parseArgs(argv) {
  const opts = { out: join(ROOT, 'backups'), target: DEFAULT_TARGET, tool: 'auto', file: null };
  const names = { '--out': 'out', '--target': 'target', '--tool': 'tool', '--file': 'file' };
  for (let i = 0; i < argv.length; i += 2) {
    const key = names[argv[i]];
    if (!key || argv[i + 1] === undefined) throw new Refusal(`Argumento no válido: ${argv[i]}`);
    opts[key] = argv[i + 1];
  }
  if (!['auto', 'local', 'docker'].includes(opts.tool)) throw new Refusal('--tool debe ser auto, local o docker');
  opts.out = resolve(opts.out);
  return opts;
}

/** Variables PG* a partir de una URL (así la contraseña nunca va en la línea de comandos). */
function connFromUrl(url, database) {
  let u;
  try {
    u = new URL(url);
  } catch {
    throw new Refusal('La URL de la base no es válida');
  }
  const conn = {
    PGHOST: u.hostname.replace(/^\[|\]$/g, ''),
    PGPORT: u.port || '5432',
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password), // secret-scan:allow lee la clave de la URL en tiempo de ejecucion, no es un valor guardado
    PGDATABASE: database ?? decodeURIComponent(u.pathname.replace(/^\//, '')),
  };
  const ssl = u.searchParams.get('sslmode');
  if (ssl) conn.PGSSLMODE = ssl;
  return conn;
}

const isLocalHost = (h) => LOCAL_HOSTS.has(h) || LOCAL_HOSTS.has(`[${h}]`);

/** Dentro del contenedor, el servidor local escucha en localhost:5432. */
function forContainer(conn) {
  return isLocalHost(conn.PGHOST) ? { ...conn, PGHOST: 'localhost', PGPORT: '5432' } : conn;
}

function sameDatabase(a, b) {
  const norm = (c) => `${isLocalHost(c.PGHOST) ? 'localhost' : c.PGHOST.toLowerCase()}:${c.PGPORT}/${c.PGDATABASE}`;
  return norm(a) === norm(b);
}

/** Ejecuta un comando (PATH o docker exec) con la conexión en el entorno. */
function run(mode, cmd, args, conn, { stdin = null, stdoutFile = null } = {}) {
  const env = { ...process.env, ...conn };
  const [bin, binArgs] =
    mode === 'docker'
      ? ['docker', ['exec', '-i', ...Object.keys(conn).flatMap((k) => ['-e', k]), CONTAINER, cmd, ...args]]
      : [cmd, args];
  return new Promise((resolvePromise) => {
    const child = spawn(bin, binArgs, { env, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const fileStream = stdoutFile ? createWriteStream(stdoutFile) : null;
    if (fileStream) child.stdout.pipe(fileStream);
    else child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.stdin.on('error', () => {});
    if (stdin) createReadStream(stdin).pipe(child.stdin);
    else child.stdin.end();
    const finish = (code) => {
      if (!fileStream) return resolvePromise({ code, out, err });
      fileStream.end(() => resolvePromise({ code, out, err }));
    };
    child.on('error', (e) => {
      err += e.message;
      finish(127);
    });
    child.on('close', finish);
  });
}

async function detectTool(wanted) {
  const local = async () => {
    for (const c of ['pg_dump', 'pg_restore', 'psql']) {
      if ((await run('local', c, ['--version'], {})).code !== 0) return false;
    }
    return true;
  };
  const docker = async () => (await run('docker', 'pg_dump', ['--version'], {})).code === 0;
  if (wanted === 'local') {
    if (await local()) return 'local';
    throw new Refusal('No se encontró pg_dump, pg_restore y psql en el PATH');
  }
  if (wanted === 'docker') {
    if (await docker()) return 'docker';
    throw new Refusal(`No se pudo usar el contenedor ${CONTAINER} (¿Docker apagado?)`);
  }
  if (await local()) return 'local';
  if (await docker()) return 'docker';
  throw new Refusal(`No se encontró pg_dump ni el contenedor ${CONTAINER}`);
}

const q = (name) => `"${name.replaceAll('"', '""')}"`;

async function psql(mode, conn, sql) {
  const r = await run(mode, 'psql', ['-X', '-At', '-F', '|', '-v', 'ON_ERROR_STOP=1', '-c', sql], conn);
  if (r.code !== 0) throw new Failure(`psql falló: ${r.err.trim().split('\n').pop()}`);
  return r.out.trim();
}

/** Filas por tabla del esquema public (incluye _prisma_migrations). */
async function countTables(mode, conn) {
  const names = (
    await psql(
      mode,
      conn,
      "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1",
    )
  )
    .split('\n')
    .filter(Boolean);
  const counts = new Map();
  if (names.length === 0) return counts;
  const sql = names.map((n) => `select '${n.replaceAll("'", "''")}', count(*) from public.${q(n)}`).join(' union all ');
  for (const line of (await psql(mode, conn, sql)).split('\n')) {
    const i = line.lastIndexOf('|');
    counts.set(line.slice(0, i), Number(line.slice(i + 1)));
  }
  return counts;
}

const sortedKeys = (...maps) => [...new Set(maps.flatMap((m) => [...m.keys()]))].sort();

async function majorVersions(mode, conn) {
  const server = Math.floor(Number(await psql(mode, conn, 'show server_version_num')) / 10000);
  const v = await run(mode, 'pg_dump', ['--version'], {});
  const client = Number(/(\d+)(?:\.\d+)?/.exec(v.out)?.[1]);
  return { server, client };
}

const pad = (n) => String(n).padStart(2, '0');
function stamp(d, withSeconds) {
  const base = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  return `${base}-${pad(d.getHours())}${pad(d.getMinutes())}${withSeconds ? pad(d.getSeconds()) : ''}`;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  try {
    assertLocalDatabase(opts.target);
  } catch (e) {
    throw new Refusal(e.message);
  }
  const targetConn = connFromUrl(opts.target);
  let sourceConn = null;
  if (!opts.file) {
    sourceConn = connFromUrl(databaseUrl());
    if (sameDatabase(sourceConn, targetConn))
      throw new Refusal('El origen y el destino de la restauración son la misma base');
  } else if (!existsSync(opts.file)) {
    throw new Refusal(`No existe el archivo ${opts.file}`);
  }
  const mode = await detectTool(opts.tool);
  const exec = (conn) => (mode === 'docker' ? forContainer(conn) : conn);

  const now = new Date();
  const temp = `${TEMP_PREFIX}${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const tempConn = exec({ ...targetConn, PGDATABASE: temp });
  const maintConn = exec(targetConn);
  let created = false;
  const cleanup = async () => {
    if (!created) return;
    created = false;
    if (!TEMP_RE.test(temp)) return;
    const r = await run(mode, 'psql', ['-X', '-c', `DROP DATABASE IF EXISTS ${q(temp)} WITH (FORCE)`], maintConn);
    if (r.code !== 0) console.error(`Aviso: no se pudo borrar la base temporal ${temp}; bórrala a mano.`);
  };
  process.once('SIGINT', () => cleanup().finally(() => process.exit(130)));

  let dumpPath = opts.file ? resolve(opts.file) : null;
  let failure = null;
  let before = null;
  try {
    if (!opts.file) {
      const src = exec(sourceConn);
      const { server, client } = await majorVersions(mode, src);
      if (client < server) {
        throw new Refusal(
          `pg_dump ${client} no puede respaldar un servidor ${server}; actualiza la imagen de la base local o usa un cliente ${server}`,
        );
      }
      before = await countTables(mode, src);
      mkdirSync(opts.out, { recursive: true });
      dumpPath = join(opts.out, `reto-${stamp(now, false)}.dump`);
      if (existsSync(dumpPath)) dumpPath = join(opts.out, `reto-${stamp(now, true)}.dump`);
      const d = await run(mode, 'pg_dump', ['--format=custom'], src, { stdoutFile: dumpPath });
      if (d.code !== 0) throw new Failure(`pg_dump falló: ${d.err.trim().split('\n').pop()}`);
    }

    await psql(mode, maintConn, `CREATE DATABASE ${q(temp)}`);
    created = true;
    const r = await run(
      mode,
      'pg_restore',
      ['--no-owner', '--no-privileges', '--exit-on-error', '--dbname', temp],
      tempConn,
      {
        stdin: dumpPath,
      },
    );
    if (r.code !== 0) throw new Failure(`pg_restore falló: ${r.err.trim().split('\n').slice(0, 2).join(' | ')}`);
    const restored = await countTables(mode, tempConn);

    const rows = [];
    let problems = [];
    if (opts.file) {
      for (const t of sortedKeys(restored)) rows.push([t, '-', restored.get(t), true]);
      if (!restored.get('_prisma_migrations')) problems.push('_prisma_migrations no existe o está vacía');
    } else {
      const after = await countTables(mode, exec(sourceConn));
      const moved = sortedKeys(before, after).filter((t) => before.get(t) !== after.get(t));
      if (moved.length) {
        problems.push(`la base cambió durante el respaldo; repítelo en un momento sin actividad (${moved.join(', ')})`);
      }
      for (const t of sortedKeys(before, restored)) {
        const ok = before.get(t) === restored.get(t);
        rows.push([t, before.get(t) ?? 'falta', restored.get(t) ?? 'falta', ok]);
        if (!ok) problems.push(`difiere la tabla ${t}`);
      }
    }
    const w = Math.max(5, ...rows.map((x) => x[0].length));
    console.log(`${'tabla'.padEnd(w)}  origen  restaurada`);
    for (const [t, a, b, ok] of rows)
      console.log(`${t.padEnd(w)}  ${String(a).padStart(6)}  ${String(b).padStart(10)}  ${ok ? '✓' : '✗'}`);
    const total = rows.reduce((s, x) => s + (Number(x[2]) || 0), 0);
    if (problems.length) throw new Failure(problems.join('; '));
    const shown = opts.file ? dumpPath : `backups/${dumpPath.split(/[\\/]/).pop()}`;
    console.log(
      opts.file
        ? `OK (sin comparación con el origen): ${shown} se restauró (${rows.length} tablas, ${total} filas)`
        : `OK: ${shown} verificado (${rows.length} tablas, ${total} filas)`,
    );
  } catch (e) {
    failure = e;
  } finally {
    await cleanup();
  }
  if (failure) {
    if (!opts.file && dumpPath && existsSync(dumpPath) && !(failure instanceof Refusal)) {
      const bad = dumpPath.replace(/\.dump$/, '.unverified.dump');
      renameSync(dumpPath, bad);
      console.error(`El volcado quedó como ${bad}`);
    } else if (!opts.file && dumpPath && failure instanceof Refusal) {
      rmSync(dumpPath, { force: true });
    }
    throw failure;
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    if (e instanceof Refusal) {
      console.error(`Rechazado: ${e.message.replace(/^test-db: /, '')}`);
      process.exit(2);
    }
    console.error(`FALLO: ${e.message}`);
    process.exit(1);
  },
);
