/**
 * Pruebas del supervisor del servicio único con hijos falsos (process.execPath -e).
 *   node --test scripts/lib/
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { after, describe, it } from 'node:test';
import { buildConfig, connectionLimitWarning, startSupervisor, webEnvironment } from './supervisor.mjs';

const dirs = [];
function tmp() {
  const dir = mkdtempSync(join(tmpdir(), 'supervisor-test-'));
  dirs.push(dir);
  return dir;
}
after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

async function freePort() {
  return new Promise((resolve) => {
    const server = createServer().listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(check, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check()) return true;
    await sleep(25);
  }
  return false;
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Hijo falso: `body` es el código JS; `dir` y `PORT` llegan por entorno. */
function fake(name, body, extraEnv = {}) {
  return {
    name,
    command: process.execPath,
    args: ['-e', body],
    cwd: process.cwd(),
    env: { ...process.env, ...extraEnv },
  };
}

// API falsa: escribe su pid, escucha en PORT y responde 200 en /api/health.
const API_OK = `
const fs = require('fs'); const http = require('http'); const dir = process.env.DIR;
fs.writeFileSync(dir + '/api.pid', String(process.pid));
const s = http.createServer((q, r) => { r.statusCode = q.url === '/api/health' ? 200 : 404; r.end('ok'); });
s.listen(Number(process.env.PORT), '127.0.0.1', () => fs.writeFileSync(dir + '/api.ready', '1'));
process.on('SIGTERM', () => s.close(() => process.exit(0)));
setInterval(() => {}, 1000);
`;

// Web falsa: anota si la API ya estaba lista al arrancar y su entorno, y se queda viva.
const WEB_OK = `
const fs = require('fs'); const dir = process.env.DIR;
fs.writeFileSync(dir + '/web.pid', String(process.pid));
fs.writeFileSync(dir + '/web.order', fs.existsSync(dir + '/api.ready') ? 'after-api' : 'before-api');
fs.writeFileSync(dir + '/web.env', JSON.stringify(Object.keys(process.env)));
fs.writeFileSync(dir + '/web.up', '1');
process.on('SIGTERM', () => process.exit(0));
setInterval(() => {}, 1000);
`;

const MIGRATE_OK = 'process.exit(0)';

function setup(overrides = {}) {
  const dir = tmp();
  return freePort().then((port) => {
    const env = { DIR: dir, PORT: String(port) };
    const config = {
      healthUrl: `http://127.0.0.1:${port}/api/health`,
      healthTimeoutMs: 5000,
      healthIntervalMs: 50,
      graceMs: 1500,
      migrate: fake('migraciones', MIGRATE_OK, env),
      api: fake('api', API_OK, env),
      web: fake('web', WEB_OK, env),
      ...overrides,
    };
    return { dir, port, env, config };
  });
}

const quiet = { log: () => {} };

describe('arranque ordenado', () => {
  it('migra, espera /api/health 200 y solo entonces arranca la web', async () => {
    const { dir, config } = await setup();
    const sup = startSupervisor(config, quiet);
    assert.ok(await until(() => existsSync(join(dir, 'web.up'))), 'la web debió arrancar');
    assert.equal(readFileSync(join(dir, 'web.order'), 'utf8'), 'after-api');
    sup.shutdown('SIGTERM');
    assert.equal(await sup.done, 0);
  });

  it('si la migración falla sale con su código y no arranca ni la API ni la web', async () => {
    const { dir, env, config } = await setup();
    config.migrate = fake('migraciones', 'process.exit(7)', env);
    const code = await startSupervisor(config, quiet).done;
    assert.equal(code, 7);
    assert.equal(existsSync(join(dir, 'api.pid')), false);
    assert.equal(existsSync(join(dir, 'web.pid')), false);
  });

  it('si la API no responde 200 a tiempo sale con 1, detiene la API y no arranca la web', async () => {
    const { dir, env, config } = await setup({ healthTimeoutMs: 600 });
    // vive pero nunca escucha
    config.api = fake(
      'api',
      `require('fs').writeFileSync(process.env.DIR + '/api.pid', String(process.pid)); setInterval(() => {}, 1000)`,
      env,
    );
    const code = await startSupervisor(config, quiet).done;
    assert.equal(code, 1);
    assert.equal(existsSync(join(dir, 'web.pid')), false);
    const pid = Number(readFileSync(join(dir, 'api.pid'), 'utf8'));
    assert.ok(await until(() => !alive(pid)), 'la API debió quedar detenida');
  });
});

describe('un hijo que termina detiene al otro', () => {
  const cases = [
    ['la API sale con 0', 'api', 'process.exit(0)', 'después de estar lista'],
    ['la API sale con 1', 'api', 'process.exit(1)', 'después de estar lista'],
    ['la web sale con 0', 'web', 'process.exit(0)'],
    ['la web sale con 3', 'web', 'process.exit(3)'],
    ['la web muere por una señal', 'web', "process.kill(process.pid, 'SIGTERM'); setInterval(() => {}, 1000)"],
  ];
  for (const [title, who, deadBody] of cases) {
    it(`${title}: detiene al otro y sale distinto de cero`, async () => {
      const { dir, env, config } = await setup();
      if (who === 'api') {
        // responde sano un instante y muere cuando la web ya arrancó
        config.api = fake(
          'api',
          `${API_OK.replace('setInterval(() => {}, 1000);', '')}
           const iv = setInterval(() => { if (fs.existsSync(dir + '/web.up')) { clearInterval(iv); ${deadBody}; } }, 25);`,
          env,
        );
      } else {
        config.web = fake('web', `require('fs').writeFileSync(process.env.DIR + '/web.up', '1'); ${deadBody}`, env);
      }
      const sup = startSupervisor(config, quiet);
      const code = await sup.done;
      assert.notEqual(code, 0);
      if (who === 'web') {
        // la API (viva) debió recibir SIGTERM
        const pid = Number(readFileSync(join(dir, 'api.pid'), 'utf8'));
        assert.ok(await until(() => !alive(pid)), 'la API debió quedar detenida');
      } else {
        const pid = Number(readFileSync(join(dir, 'web.pid'), 'utf8'));
        assert.ok(await until(() => !alive(pid)), 'la web debió quedar detenida');
      }
    });
  }
});

describe('señales', () => {
  it('SIGTERM se reenvía a ambos hijos, sale 0 dentro del plazo y una segunda señal se ignora', async () => {
    const { dir, config } = await setup();
    const sent = [];
    const sup = startSupervisor(config, {
      log: () => {},
      kill: (child, signal) => (sent.push(signal), child.kill(signal)),
    });
    assert.ok(await until(() => existsSync(join(dir, 'web.up'))));
    sup.shutdown('SIGTERM');
    sup.shutdown('SIGTERM');
    assert.equal(await sup.done, 0);
    assert.deepEqual(sent, ['SIGTERM', 'SIGTERM']);
    for (const f of ['api.pid', 'web.pid']) {
      const pid = Number(readFileSync(join(dir, f), 'utf8'));
      assert.ok(await until(() => !alive(pid)), `${f} debió terminar`);
    }
  });

  it('SIGINT también se reenvía', async () => {
    const { dir, config } = await setup();
    const sent = [];
    const sup = startSupervisor(config, {
      log: () => {},
      kill: (child, signal) => (sent.push(signal), child.kill(signal === 'SIGINT' ? 'SIGTERM' : signal)),
    });
    assert.ok(await until(() => existsSync(join(dir, 'web.up'))));
    sup.shutdown('SIGINT');
    assert.equal(await sup.done, 0);
    assert.deepEqual(sent, ['SIGINT', 'SIGINT']);
  });

  it('si un hijo ignora SIGTERM pasado el plazo se envía SIGKILL y sale 1', async () => {
    const { dir, config } = await setup({ graceMs: 400 });
    const sent = [];
    // el supervisor "envía" SIGTERM pero el hijo no lo recibe: equivale a un proceso que lo ignora
    const kill = (child, signal) => {
      sent.push(signal);
      if (signal !== 'SIGTERM') child.kill(signal);
    };
    const sup = startSupervisor(config, { log: () => {}, kill });
    assert.ok(await until(() => existsSync(join(dir, 'web.up'))));
    sup.shutdown('SIGTERM');
    assert.equal(await sup.done, 1);
    assert.ok(sent.includes('SIGKILL'));
    for (const f of ['api.pid', 'web.pid']) {
      const pid = Number(readFileSync(join(dir, f), 'utf8'));
      assert.ok(await until(() => !alive(pid)), `${f} debió morir`);
    }
  });
});

describe('entorno y configuración', () => {
  const SECRETS = {
    DATABASE_URL: 'postgresql://u:secreto@db:5432/x',
    JWT_SECRET: 'a',
    JWT_REFRESH_SECRET: 'b',
    JWT_ACCESS_EXPIRES_IN: '15m',
    CLOUDINARY_API_SECRET: 'c',
    SEED_ADMIN_PASSWORD: 'd',
  };

  it('el entorno de la web no lleva DATABASE_URL, JWT_*, CLOUDINARY_API_SECRET ni SEED_*', () => {
    const env = { ...SECRETS, NODE_ENV: 'production', PORT: '3000', PATH: '/bin', NEXT_TELEMETRY_DISABLED: '1' };
    const web = webEnvironment(env);
    for (const key of Object.keys(SECRETS)) assert.equal(key in web, false, key);
    assert.equal(web.NODE_ENV, 'production');
    assert.equal(web.NEXT_TELEMETRY_DISABLED, '1');
    assert.equal(buildConfig(env, '/app').web.env.JWT_SECRET, undefined);
  });

  it('un proceso web real arrancado por el supervisor no recibe los secretos', async () => {
    const { dir, config } = await setup();
    const secretsEnv = { ...config.web.env, ...SECRETS };
    config.web = { ...config.web, env: { ...webEnvironment(secretsEnv), DIR: dir } };
    const sup = startSupervisor(config, quiet);
    assert.ok(await until(() => existsSync(join(dir, 'web.up'))));
    const keys = JSON.parse(readFileSync(join(dir, 'web.env'), 'utf8'));
    for (const key of Object.keys(SECRETS)) assert.equal(keys.includes(key), false, key);
    sup.shutdown('SIGTERM');
    await sup.done;
  });

  it('TRUST_PROXY vale 1 solo si no está definido; un valor del panel gana', () => {
    assert.equal(buildConfig({}, '/app').api.env.TRUST_PROXY, '1');
    assert.equal(buildConfig({ TRUST_PROXY: '' }, '/app').api.env.TRUST_PROXY, '1');
    assert.equal(buildConfig({ TRUST_PROXY: '2' }, '/app').api.env.TRUST_PROXY, '2');
    assert.equal(buildConfig({ TRUST_PROXY: 'false' }, '/app').api.env.TRUST_PROXY, 'false');
  });

  it('la web recibe API_INTERNAL_URL con el puerto de la API y con él el proxyTimeout de 60 s', async () => {
    const web = buildConfig({ API_PORT: '4001' }, '/app').web.env;
    assert.equal(web.API_INTERNAL_URL, 'http://127.0.0.1:4001');
    assert.equal(buildConfig({}, '/app').web.env.API_INTERNAL_URL, 'http://127.0.0.1:3001');
    // next.config.mjs calcula el plazo al cargarse, con el entorno del proceso web
    const config = pathToFileURL(join(import.meta.dirname, '..', '..', 'frontend', 'next.config.mjs'));
    const previous = process.env.API_INTERNAL_URL;
    try {
      process.env.API_INTERNAL_URL = web.API_INTERNAL_URL;
      const loaded = (await import(`${config.href}?con-api-${Date.now()}`)).default;
      assert.equal(loaded.experimental.proxyTimeout, 60_000);
      delete process.env.API_INTERNAL_URL;
      const plain = (await import(`${config.href}?sin-api-${Date.now()}`)).default;
      assert.equal(plain.experimental, undefined);
    } finally {
      if (previous === undefined) delete process.env.API_INTERNAL_URL;
      else process.env.API_INTERNAL_URL = previous;
    }
  });

  it('la API escucha en loopback con puerto y heap por omisión; la web en 0.0.0.0 con su heap', () => {
    const cfg = buildConfig({}, '/app');
    assert.equal(cfg.api.env.HOST, '127.0.0.1');
    assert.equal(cfg.api.env.PORT, '3001');
    assert.ok(cfg.api.args.includes('--max-old-space-size=224'));
    assert.ok(cfg.web.args.includes('--max-old-space-size=160'));
    assert.deepEqual(cfg.web.args.slice(-4), ['-H', '0.0.0.0', '-p', '3000']);
    assert.equal(cfg.healthUrl, 'http://127.0.0.1:3001/api/health');
    const custom = buildConfig(
      { API_PORT: '4001', PORT: '8080', API_MAX_OLD_SPACE_MB: '300', WEB_MAX_OLD_SPACE_MB: '100' },
      '/app',
    );
    assert.equal(custom.api.env.PORT, '4001');
    assert.ok(custom.api.args.includes('--max-old-space-size=300'));
    assert.ok(custom.web.args.includes('--max-old-space-size=100'));
    assert.equal(custom.web.args.at(-1), '8080');
    assert.equal(custom.healthUrl, 'http://127.0.0.1:4001/api/health');
  });

  it('en producción sin connection_limit hay un aviso que no contiene la URL, el usuario ni la clave', () => {
    const url = 'postgresql://usuario_x:clave_y@db.ejemplo.net:5432/reto?schema=public';
    const warning = connectionLimitWarning({ NODE_ENV: 'production', DATABASE_URL: url });
    assert.match(warning, /connection_limit=5/);
    for (const piece of [url, 'usuario_x', 'clave_y', 'db.ejemplo.net'])
      assert.equal(warning.includes(piece), false, piece);
  });

  it('sin aviso con connection_limit, fuera de producción o sin DATABASE_URL', () => {
    assert.equal(
      connectionLimitWarning({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://u:p@h/db?schema=public&connection_limit=5',
      }),
      null,
    );
    assert.equal(connectionLimitWarning({ NODE_ENV: 'development', DATABASE_URL: 'postgresql://u:p@h/db' }), null);
    assert.equal(connectionLimitWarning({ NODE_ENV: 'production' }), null);
  });
});
