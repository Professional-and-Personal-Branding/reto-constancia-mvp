/**
 * Lógica del supervisor del servicio único (API + web en un contenedor).
 * El punto de entrada es scripts/start-prod.mjs; aquí vive todo lo comprobable con node:test.
 *
 * Contrato (spec platform-operations, openspec/changes/single-service-deploy):
 *   1. `prisma migrate deploy`: si falla, sale con su código y no arranca nada.
 *   2. Arranca la API en 127.0.0.1:API_PORT y espera hasta 60 s a que /api/health responda 200.
 *   3. Solo entonces arranca la web en 0.0.0.0:PORT, con un entorno filtrado (sin secretos).
 *   4. Si un hijo termina (con cualquier código) detiene al otro y sale distinto de cero.
 *   5. SIGTERM/SIGINT se reenvían a ambos; tras 10 s se mata lo que siga vivo.
 */
import { spawn } from 'node:child_process';
import { join } from 'node:path';

export const DEFAULTS = {
  apiPort: 3001,
  webPort: 3000,
  apiHeapMb: 224,
  webHeapMb: 160,
  trustProxy: '1',
  healthTimeoutMs: 60_000,
  healthIntervalMs: 500,
  graceMs: 10_000,
};

/** Variables que la web sí recibe; todo lo demás (DATABASE_URL, JWT_*, CLOUDINARY_*, SEED_*) se queda fuera. */
const WEB_ENV_ALLOW = /^(NODE_ENV|PORT|PATH|HOME|TZ|LANG|SYSTEMROOT|NEXT_.*)$/i;

function positiveInt(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export function webEnvironment(env) {
  const out = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && WEB_ENV_ALLOW.test(key)) out[key] = value;
  }
  return out;
}

/** Aviso (sin la URL ni sus credenciales) cuando falta connection_limit en producción. */
export function connectionLimitWarning(env) {
  if (env.NODE_ENV !== 'production') return null;
  const url = env.DATABASE_URL?.trim();
  if (!url || /[?&]connection_limit=/i.test(url)) return null;
  return 'ADVERTENCIA: DATABASE_URL no define connection_limit; se recomienda connection_limit=5 para no agotar las conexiones de PostgreSQL (migraciones, respaldos y psql también necesitan cupo).';
}

/** Comandos de los tres procesos a partir del entorno. `root` es la raíz del repositorio. */
export function buildConfig(env, root) {
  const backend = join(root, 'backend');
  const frontend = join(root, 'frontend');
  const apiPort = positiveInt(env.API_PORT, DEFAULTS.apiPort);
  const webPort = positiveInt(env.PORT, DEFAULTS.webPort);
  const apiHeap = positiveInt(env.API_MAX_OLD_SPACE_MB, DEFAULTS.apiHeapMb);
  const webHeap = positiveInt(env.WEB_MAX_OLD_SPACE_MB, DEFAULTS.webHeapMb);
  const trustProxy = env.TRUST_PROXY?.trim() ? env.TRUST_PROXY : DEFAULTS.trustProxy;

  return {
    healthUrl: `http://127.0.0.1:${apiPort}/api/health`,
    healthTimeoutMs: DEFAULTS.healthTimeoutMs,
    healthIntervalMs: DEFAULTS.healthIntervalMs,
    graceMs: DEFAULTS.graceMs,
    // prisma se invoca por su JS (no por npx) para no depender de un shell ni de .cmd en Windows
    migrate: {
      name: 'migraciones',
      command: process.execPath,
      args: [join(backend, 'node_modules', 'prisma', 'build', 'index.js'), 'migrate', 'deploy'],
      cwd: backend,
      env: { ...env },
    },
    api: {
      name: 'api',
      command: process.execPath,
      args: [`--max-old-space-size=${apiHeap}`, join(backend, 'dist', 'main.js')],
      cwd: backend,
      env: { ...env, PORT: String(apiPort), HOST: '127.0.0.1', TRUST_PROXY: trustProxy },
    },
    web: {
      name: 'web',
      command: process.execPath,
      args: [
        `--max-old-space-size=${webHeap}`,
        join(frontend, 'node_modules', 'next', 'dist', 'bin', 'next'),
        'start',
        '-H',
        '0.0.0.0',
        '-p',
        String(webPort),
      ],
      cwd: frontend,
      // API_INTERNAL_URL no es secreto: next.config.mjs la lee al cargarse (también en `next start`)
      // para fijar proxyTimeout en 60 s; sin ella rige el plazo de 30 s de Next.
      env: { ...webEnvironment(env), PORT: String(webPort), API_INTERNAL_URL: `http://127.0.0.1:${apiPort}` },
    },
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const STOP = Symbol('stop');

/**
 * Corre la secuencia completa. Devuelve `{ done, shutdown }`: `done` resuelve con el código de
 * salida del supervisor; `shutdown(señal)` es lo que start-prod.mjs conecta a SIGTERM/SIGINT.
 * `kill` y `log` son inyectables para las pruebas.
 */
export function startSupervisor(config, options = {}) {
  const log = options.log ?? ((line) => console.log(`[supervisor] ${line}`));
  const kill = options.kill ?? ((child, signal) => child.kill(signal));

  const live = new Set();
  const exits = [];
  let ending = false;
  let forced = false;
  let graceTimer = null;
  let resolveStop;
  const stopped = new Promise((resolve) => {
    resolveStop = resolve;
  }).then(() => STOP);

  function launch(spec) {
    const child = spawn(spec.command, spec.args, { cwd: spec.cwd, env: spec.env, stdio: 'inherit' });
    live.add(child);
    const exited = new Promise((resolve) => {
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        live.delete(child);
        resolve({ name: spec.name, ...result });
      };
      child.once('error', (err) => {
        log(`no se pudo iniciar ${spec.name}: ${err.message}`);
        finish({ code: 1, signal: null });
      });
      child.once('exit', (code, signal) => finish({ code, signal }));
    });
    exits.push(exited);
    return { child, exited };
  }

  function beginEnding(signal) {
    ending = true;
    for (const child of live) kill(child, signal);
    graceTimer = setTimeout(() => {
      forced = true;
      for (const child of live) kill(child, 'SIGKILL');
    }, config.graceMs);
  }

  async function drain() {
    await Promise.all(exits);
    clearTimeout(graceTimer);
  }

  const describe = (r) => (r.signal ? `señal ${r.signal}` : `código ${r.code}`);
  const failCode = (r) => (typeof r.code === 'number' && r.code !== 0 ? r.code : 1);

  async function waitHealthy(api) {
    const deadline = Date.now() + config.healthTimeoutMs;
    let apiGone = false;
    api.exited.then(() => {
      apiGone = true;
    });
    while (Date.now() < deadline) {
      if (ending || apiGone) return false;
      try {
        const res = await fetch(config.healthUrl, { signal: AbortSignal.timeout(2000) });
        if (res.status === 200) return true;
      } catch {
        /* la API aún no escucha */
      }
      await sleep(config.healthIntervalMs);
    }
    return false;
  }

  async function main() {
    const migration = launch(config.migrate);
    const migrated = await Promise.race([migration.exited, stopped]);
    if (migrated === STOP) {
      await drain();
      return forced ? 1 : 0;
    }
    if (migrated.code !== 0) {
      log(`las migraciones terminaron con ${describe(migrated)}; no se inicia nada`);
      return failCode(migrated);
    }

    const api = launch(config.api);
    const healthy = await Promise.race([waitHealthy(api), stopped]);
    if (healthy === STOP) {
      await drain();
      return forced ? 1 : 0;
    }
    if (!healthy) {
      const gone = await Promise.race([api.exited, Promise.resolve(null)]);
      if (gone) {
        log(`la API terminó antes de estar lista (${describe(gone)})`);
        return failCode(gone);
      }
      log(`la API no respondió ${config.healthUrl} en ${Math.round(config.healthTimeoutMs / 1000)} s; se detiene`);
      beginEnding('SIGTERM');
      await drain();
      return 1;
    }
    log('la API está lista; se inicia la web');

    const web = launch(config.web);
    const first = await Promise.race([api.exited, web.exited, stopped]);
    if (first === STOP) {
      await drain();
      log(forced ? 'cierre forzado tras el plazo de gracia' : 'cierre ordenado');
      return forced ? 1 : 0;
    }
    log(`el proceso ${first.name} terminó (${describe(first)}); se detiene el otro`);
    beginEnding('SIGTERM');
    await drain();
    return failCode(first);
  }

  return {
    done: main(),
    shutdown(signal = 'SIGTERM') {
      if (ending) return; // una segunda señal durante el cierre se ignora
      log(`recibí ${signal}; se reenvía a los procesos`);
      beginEnding(signal);
      resolveStop();
    },
  };
}
