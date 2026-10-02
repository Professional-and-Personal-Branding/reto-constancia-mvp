#!/usr/bin/env node
/**
 * Valida el catálogo de casos de prueba (docs/qa/catalog.mjs) contra las suites reales.
 *
 * 1. Corre las suites y guarda sus resultados en .qa-results/:
 *      unit      Jest unitarias del backend
 *      web       node:test unitarias de la web (frontend/lib/*.test.ts)
 *      api       Jest e2e del backend (supertest + Postgres)
 *      ui        Playwright, recorridos de e2e/tests
 *      guide     Playwright, suite de capturas de la guía (escribe en .qa-results/shots)
 *      sessions  scripts/parallel-session-test.mjs contra la API compilada
 * 2. Cruza cada caso con las pruebas que lo validan y le asigna un estado.
 * 3. Genera docs/qa/test-cases.md, docs/qa/test-cases.csv y docs/qa/validation-report.md.
 *
 * Uso:
 *   node scripts/validate-test-cases.mjs                 # corre todo y genera los documentos
 *   node scripts/validate-test-cases.mjs --reuse         # no corre nada: usa .qa-results/
 *   node scripts/validate-test-cases.mjs --only=unit,api # corre solo esas suites
 *   node scripts/validate-test-cases.mjs --skip-build    # no recompila la API para sessions
 *
 * Requiere Postgres en marcha (docker compose up -d db) con el seed cargado. Sale con código 1
 * si algún caso falla o si un enlace del catálogo no encuentra su prueba.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BACKEND = join(ROOT, 'backend');
const FRONTEND = join(ROOT, 'frontend');
const E2E = join(ROOT, 'e2e');
const OUT = join(ROOT, '.qa-results');
const DOCS = join(ROOT, 'docs', 'qa');
const API_URL = process.env.API_URL ?? 'http://localhost:3002/api';

const SUITES = {
  unit: { label: 'Unitarias (Jest)', where: 'backend/src/**/*.spec.ts' },
  web: { label: 'Unitarias de la web (node:test)', where: 'frontend/lib/*.test.ts' },
  api: { label: 'API e2e (Jest + supertest)', where: 'backend/test/*.e2e-spec.ts' },
  ui: { label: 'Recorridos de UI (Playwright)', where: 'e2e/tests/*.spec.ts' },
  guide: { label: 'Capturas de la guía (Playwright)', where: 'e2e/guide/capture.spec.ts' },
  sessions: { label: 'Sesiones paralelas (script)', where: 'scripts/parallel-session-test.mjs' },
};

const argv = process.argv.slice(2);
const REUSE = argv.includes('--reuse');
const SKIP_BUILD = argv.includes('--skip-build');
const onlyArg = argv.find((a) => a.startsWith('--only='));
const ONLY = onlyArg ? onlyArg.slice(7).split(',').filter(Boolean) : Object.keys(SUITES);

// ─────────────────────────── ejecución de suites ───────────────────────────

function sh(cmd, cwd, env = {}) {
  const started = Date.now();
  const res = spawnSync(cmd, { cwd, shell: true, encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024 });
  return { code: res.status ?? 1, out: `${res.stdout ?? ''}${res.stderr ?? ''}`, ms: Date.now() - started };
}

async function apiIsUp() {
  try {
    return (await fetch(`${API_URL}/health`)).ok;
  } catch {
    return false;
  }
}

async function startApi() {
  if (await apiIsUp()) return () => {};
  if (!SKIP_BUILD) {
    const build = sh('npm run build', BACKEND);
    if (build.code !== 0) throw new Error(`No compiló la API:\n${build.out.slice(-2000)}`);
  }
  const child = spawn('node dist/main.js', { cwd: BACKEND, shell: true, stdio: 'ignore', env: { ...process.env, PORT: '3002', THROTTLE_LIMIT: process.env.THROTTLE_LIMIT ?? '2000' } });
  for (let i = 0; i < 40; i++) {
    if (await apiIsUp()) {
      return () => {
        if (process.platform === 'win32') spawnSync(`taskkill /pid ${child.pid} /T /F`, { shell: true, stdio: 'ignore' });
        else child.kill('SIGTERM');
      };
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  child.kill();
  throw new Error('La API no respondió en 40 s');
}

async function runSuite(kind) {
  const file = join(OUT, `${kind}.json`);
  let run;
  if (kind === 'unit') {
    run = sh(`npx jest --json --outputFile="${file}"`, BACKEND);
  } else if (kind === 'web') {
    // node:test no anota el archivo en JUnit: se corre un archivo por vez, un XML por archivo
    for (const old of readdirSync(OUT).filter((f) => /^web-.*\.xml$/.test(f))) rmSync(join(OUT, old));
    const files = readdirSync(join(FRONTEND, 'lib')).filter((f) => f.endsWith('.test.ts'));
    const runs = files.map((f) =>
      sh(`node --experimental-strip-types --no-warnings --test --test-reporter=junit --test-reporter-destination="${join(OUT, `web-${f}.xml`)}" lib/${f}`, FRONTEND),
    );
    run = { code: runs.some((r) => r.code !== 0) ? 1 : 0, out: runs.map((r) => r.out).join('\n'), ms: runs.reduce((a, r) => a + r.ms, 0) };
  } else if (kind === 'api') {
    run = sh(`npx jest --config ./test/jest-e2e.json --runInBand --json --outputFile="${file}"`, BACKEND);
  } else if (kind === 'ui') {
    run = sh('npx playwright test --reporter=json', E2E, { PLAYWRIGHT_JSON_OUTPUT_NAME: file });
  } else if (kind === 'guide') {
    run = sh('npx playwright test -c playwright.guide.config.ts --reporter=json', E2E, {
      PLAYWRIGHT_JSON_OUTPUT_NAME: file,
      GUIDE_SHOTS_DIR: join(OUT, 'shots'),
    });
  } else if (kind === 'sessions') {
    const stop = await startApi();
    try {
      run = sh('node scripts/parallel-session-test.mjs', ROOT, { API_URL });
    } finally {
      stop();
    }
    writeFileSync(join(OUT, 'sessions.log'), run.out);
  }
  writeFileSync(join(OUT, `${kind}.meta.json`), JSON.stringify({ code: run.code, ms: run.ms, at: new Date().toISOString() }));
  if (!existsSync(file) && kind !== 'sessions' && kind !== 'web') writeFileSync(join(OUT, `${kind}.log`), run.out);
  return run;
}

// ─────────────────────────── lectura de resultados ───────────────────────────

/** Devuelve [{ kind, file, title, status: passed|failed|skipped, ms }] de una suite. */
function readResults(kind) {
  const tests = [];
  if (kind === 'unit' || kind === 'api') {
    const path = join(OUT, `${kind}.json`);
    if (!existsSync(path)) return null;
    const json = JSON.parse(readFileSync(path, 'utf8'));
    for (const suite of json.testResults) {
      for (const t of suite.assertionResults) {
        tests.push({ kind, file: basename(suite.name), title: t.title, status: t.status === 'passed' ? 'passed' : t.status === 'failed' ? 'failed' : 'skipped', ms: t.duration ?? 0 });
      }
      if (suite.status === 'failed' && suite.assertionResults.length === 0) {
        tests.push({ kind, file: basename(suite.name), title: '(la suite no cargó)', status: 'failed', ms: 0, error: suite.message });
      }
    }
  } else if (kind === 'web') {
    const xmls = existsSync(OUT) ? readdirSync(OUT).filter((f) => /^web-.*\.xml$/.test(f)) : [];
    if (!xmls.length) return null;
    const unescape = (t) => t.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    for (const xml of xmls) {
      const file = xml.replace(/^web-/, '').replace(/\.xml$/, '');
      const body = readFileSync(join(OUT, xml), 'utf8');
      // <testcase name="..." time="..."/> o <testcase ...>…<failure …/>…</testcase>
      for (const m of body.matchAll(/<testcase name="([^"]*)" time="([\d.]+)"[^>]*?(\/>|>([\s\S]*?)<\/testcase>)/g)) {
        const inner = m[4] ?? '';
        const status = /<failure/.test(inner) ? 'failed' : /<skipped/.test(inner) ? 'skipped' : 'passed';
        tests.push({ kind, file, title: unescape(m[1]), status, ms: Number(m[2]) * 1000 });
      }
    }
  } else if (kind === 'ui' || kind === 'guide') {
    const path = join(OUT, `${kind}.json`);
    if (!existsSync(path)) return null;
    const json = JSON.parse(readFileSync(path, 'utf8'));
    const walk = (suite) => {
      for (const spec of suite.specs ?? []) {
        const results = spec.tests.flatMap((t) => t.results);
        const skipped = spec.tests.every((t) => t.status === 'skipped');
        tests.push({
          kind,
          file: basename(spec.file),
          title: spec.title,
          status: skipped ? 'skipped' : spec.ok ? 'passed' : 'failed',
          ms: results.reduce((acc, r) => acc + (r.duration ?? 0), 0),
          flaky: spec.tests.some((t) => t.status === 'flaky'),
        });
      }
      for (const child of suite.suites ?? []) walk(child);
    };
    for (const suite of json.suites ?? []) walk(suite);
  } else if (kind === 'sessions') {
    const path = join(OUT, 'sessions.log');
    if (!existsSync(path)) return null;
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s+(PASS|FAIL)\s{2}(.+?)(?:\s{2}->\s{2}.*)?$/);
      if (m) tests.push({ kind, file: 'parallel-session-test.mjs', title: m[2].trim(), status: m[1] === 'PASS' ? 'passed' : 'failed', ms: 0 });
    }
  }
  return tests;
}

function suiteMeta(kind) {
  const path = join(OUT, `${kind}.meta.json`);
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
}

// ─────────────────────────── cruce con el catálogo ───────────────────────────

function matches(link, test) {
  if (link.kind !== test.kind || link.file !== test.file) return false;
  if (link.kind === 'sessions') return link.title === '*' || test.title.startsWith(link.title);
  return test.title === link.title;
}

function evaluate(cases, results) {
  const used = new Set();
  const evaluated = cases.map((c) => {
    if (!c.auto?.length) {
      const m = c.manual ?? {};
      return { ...c, status: m.result === 'Aprobado' ? 'Aprobado (manual)' : m.result ?? 'Pendiente (manual)', links: [] };
    }
    const links = c.auto.map((link) => {
      const pool = results[link.kind];
      if (!pool) return { ...link, outcome: 'no-run' };
      const hits = pool.filter((t) => matches(link, t));
      hits.forEach((t) => used.add(t));
      if (!hits.length) return { ...link, outcome: 'missing' };
      const outcome = hits.some((t) => t.status === 'failed') ? 'failed' : hits.every((t) => t.status === 'skipped') ? 'skipped' : 'passed';
      return { ...link, outcome, count: hits.length, ms: hits.reduce((a, t) => a + t.ms, 0), flaky: hits.some((t) => t.flaky) };
    });
    let status = 'Aprobado';
    if (links.some((l) => l.outcome === 'failed')) status = 'Fallido';
    else if (links.some((l) => l.outcome === 'missing')) status = 'Enlace roto';
    else if (links.some((l) => l.outcome === 'no-run' || l.outcome === 'skipped')) status = 'Sin ejecutar';
    return { ...c, status, links };
  });
  const orphans = Object.values(results)
    .filter(Boolean)
    .flat()
    .filter((t) => !used.has(t) && !/setup/i.test(t.file));
  return { evaluated, orphans };
}

// ─────────────────────────── documentos ───────────────────────────

const ICON = { passed: '✅', failed: '❌', missing: '⚠️', 'no-run': '⏸️', skipped: '⏭️' };
const STATUS_ICON = { Aprobado: '✅', 'Aprobado (manual)': '✅', Fallido: '❌', 'Enlace roto': '⚠️', 'Sin ejecutar': '⏸️', 'Limitación conocida': '🟡', 'Pendiente (manual)': '⏸️' };
const KIND_LABEL = { unit: 'Unitaria', web: 'Web (unitaria)', api: 'API e2e', ui: 'UI', guide: 'Guía', sessions: 'Sesiones' };
const mdEscape = (s) => String(s).replace(/\|/g, '\\|');
const fmtMs = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);

function git(cmd) {
  const r = spawnSync(`git ${cmd}`, { cwd: ROOT, shell: true, encoding: 'utf8' });
  return (r.stdout ?? '').trim();
}

function buildCaseDoc(c, mod) {
  const rows = [
    `### ${c.id} · ${c.title}`,
    '',
    '| Módulo | Prioridad | Tipo | Paso de la guía | Estado |',
    '|---|---|---|---|---|',
    `| ${mod} | ${c.priority} | ${c.type} | ${c.guide ?? '—'} | ${STATUS_ICON[c.status] ?? ''} ${c.status} |`,
    '',
  ];
  if (c.defect || c.observation) rows.push(`> Relacionado con ${[c.defect, c.observation].filter(Boolean).join(', ')} (ver reporte de validación).`, '');
  rows.push('**Precondiciones**', '', ...c.pre.map((p) => `- ${p}`), '');
  rows.push(`**Datos de prueba:** ${c.data}`, '');
  rows.push('**Pasos**', '', ...c.steps.map((s, i) => `${i + 1}. ${s}`), '');
  rows.push('**Resultado esperado**', '', ...c.expected.map((e) => `- ${e}`), '');
  if (c.links.length) {
    rows.push('**Validación automatizada**', '', '| | Suite | Archivo | Prueba |', '|---|---|---|---|');
    for (const l of c.links) {
      rows.push(`| ${ICON[l.outcome]} | ${KIND_LABEL[l.kind]} | \`${l.file}\` | ${mdEscape(l.title === '*' ? 'todos los chequeos' : l.title)}${l.kind === 'sessions' && l.count > 1 ? ` (${l.count})` : ''} |`);
    }
    rows.push('');
  } else if (c.manual) {
    rows.push(`**Verificación manual:** ${c.manual.result} el ${c.manual.date}. Evidencia: ${c.manual.evidence}.`, '');
  }
  return rows.join('\n');
}

function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function writeDocs({ evaluated, orphans, results, catalog, ranAt }) {
  mkdirSync(DOCS, { recursive: true });
  const modName = Object.fromEntries(catalog.MODULES);
  const modOf = (c) => c.id.split('-')[1];
  const commit = git('rev-parse --short HEAD');
  const branch = git('rev-parse --abbrev-ref HEAD');
  // Los documentos que este script genera no cuentan como cambios del código validado
  const dirty = git('status --porcelain -- . ":(exclude)docs/qa" ":(exclude).qa-results"') ? ' (con cambios sin commit)' : '';
  const date = ranAt.slice(0, 10);

  const count = (pred) => evaluated.filter(pred).length;
  const ok = (c) => c.status.startsWith('Aprobado');
  const bad = (c) => c.status === 'Fallido' || c.status === 'Enlace roto';

  // ---------- test-cases.md ----------
  const md = [
    '# Catálogo de casos de prueba',
    '',
    `> Documento generado por \`node scripts/validate-test-cases.mjs\` a partir de [catalog.mjs](catalog.mjs). No lo edites a mano: cambia el catálogo y vuelve a validar.`,
    `> Última validación: **${date}** · rama \`${branch}\` · commit \`${commit}\`${dirty}. Detalle en [validation-report.md](validation-report.md).`,
    '',
    `**${evaluated.length} casos** · ${count(ok)} aprobados · ${count((c) => c.status === 'Fallido')} fallidos · ${count((c) => c.status === 'Limitación conocida')} con limitación conocida · ${count((c) => c.links.length > 0)} automatizados.`,
    '',
    '## Cómo leer cada caso',
    '',
    '- **Prioridad:** Alta (bloquea el reto: sesión, registro, validación, ranking, dinero), Media (función secundaria o error manejado), Baja (documentación o detalle visual).',
    '- **Tipo:** Funcional, Negativo (entrada inválida), Seguridad (acceso y configuración), UI, Integración (servicios externos o varias piezas), Regresión (protege un defecto corregido) u Observación (limitación conocida).',
    '- **Paso de la guía:** el paso de [guia-plataforma.html](../guia-plataforma.html) donde se usa la función.',
    '- **Validación automatizada:** cada fila es una prueba real; el caso se aprueba solo si todas pasan en la última validación.',
    `- **Datos de partida:** seed de desarrollo (\`${catalog.SEED.admin}\`, participantes ana, bruno, carla, diego y elena \`@reto.local\`, contraseña \`${catalog.SEED.password}\` para todas). ${catalog.SEED.challenge}. Para no tocar ese reto, cada suite crea los suyos en otro período: API e2e en 2094–2200, recorridos de UI en 2025, guía en octubre de 2026 y sesiones paralelas en 2030.`,
    '',
    '## Índice',
    '',
    '| Módulo | Casos | Aprobados | Otros |',
    '|---|---:|---:|---:|',
    ...catalog.MODULES.map(([code, name]) => {
      const list = evaluated.filter((c) => modOf(c) === code);
      return `| [${name}](#${code.toLowerCase()}) | ${list.length} | ${list.filter(ok).length} | ${list.filter((c) => !ok(c)).length} |`;
    }),
    '',
  ];
  for (const [code, name] of catalog.MODULES) {
    const list = evaluated.filter((c) => modOf(c) === code);
    if (!list.length) continue;
    md.push(`<a id="${code.toLowerCase()}"></a>`, '', `## ${name}`, '', '| ID | Caso | Prioridad | Tipo | Estado |', '|---|---|---|---|---|');
    md.push(...list.map((c) => `| [${c.id}](#${c.id.toLowerCase()}) | ${c.title} | ${c.priority} | ${c.type} | ${STATUS_ICON[c.status] ?? ''} ${c.status} |`), '');
    md.push(...list.map((c) => `<a id="${c.id.toLowerCase()}"></a>\n\n${buildCaseDoc(c, name)}`));
  }
  writeFileSync(join(DOCS, 'test-cases.md'), md.join('\n'));

  // ---------- test-cases.csv ----------
  const header = ['ID', 'Módulo', 'Caso', 'Prioridad', 'Tipo', 'Paso de la guía', 'Precondiciones', 'Datos', 'Pasos', 'Resultado esperado', 'Pruebas', 'Estado', 'Fecha de validación'];
  const lines = [header.join(',')];
  for (const c of evaluated) {
    lines.push([
      c.id, modName[modOf(c)], c.title, c.priority, c.type, c.guide ?? '',
      c.pre.join(' | '), c.data, c.steps.map((s, i) => `${i + 1}. ${s}`).join(' | '), c.expected.join(' | '),
      c.links.length ? c.links.map((l) => `[${KIND_LABEL[l.kind]}] ${l.file} › ${l.title} = ${l.outcome}`).join(' | ') : `Manual: ${c.manual?.evidence ?? ''}`,
      c.status, c.links.length ? date : c.manual?.date ?? '',
    ].map(csvCell).join(','));
  }
  // BOM para que Excel abra el CSV con acentos correctos
  writeFileSync(join(DOCS, 'test-cases.csv'), '﻿' + lines.join('\r\n') + '\r\n');

  // ---------- validation-report.md ----------
  const suiteRows = Object.entries(SUITES).map(([kind, s]) => {
    const tests = results[kind];
    const meta = suiteMeta(kind);
    if (!tests) return `| ${s.label} | \`${s.where}\` | — | — | — | — | sin resultados |`;
    const passed = tests.filter((t) => t.status === 'passed').length;
    const failed = tests.filter((t) => t.status === 'failed').length;
    return `| ${s.label} | \`${s.where}\` | ${tests.length} | ${passed} | ${failed} | ${meta ? fmtMs(meta.ms) : '—'} | ${meta ? meta.at.replace('T', ' ').slice(0, 16) : '—'} |`;
  });
  const totalTests = Object.values(results).filter(Boolean).flat();
  const failedTests = totalTests.filter((t) => t.status === 'failed');
  const byPriority = ['Alta', 'Media', 'Baja'].map((p) => {
    const list = evaluated.filter((c) => c.priority === p);
    return `| ${p} | ${list.length} | ${list.filter(ok).length} | ${list.filter(bad).length} |`;
  });
  const byType = [...new Set(evaluated.map((c) => c.type))].map((t) => `| ${t} | ${evaluated.filter((c) => c.type === t).length} |`);
  const problems = evaluated.filter((c) => !ok(c));

  const report = [
    '# Reporte de validación de casos de prueba',
    '',
    `- **Fecha:** ${ranAt.replace('T', ' ').slice(0, 16)} (UTC)`,
    `- **Código:** rama \`${branch}\`, commit \`${commit}\`${dirty}`,
    `- **Entorno:** Node ${process.version}, ${process.platform}; API ${API_URL}; Postgres local (Docker, puerto 5433)`,
    `- **Comando:** \`node scripts/validate-test-cases.mjs${argv.length ? ' ' + argv.join(' ') : ''}\``,
    '',
    '## Resultado',
    '',
    `**${count(ok)} de ${evaluated.length} casos aprobados**; ${count((c) => c.status === 'Fallido')} fallidos, ${count((c) => c.status === 'Enlace roto')} con enlace roto, ${count((c) => c.status === 'Sin ejecutar')} sin ejecutar y ${count((c) => c.status === 'Limitación conocida')} con limitación conocida.`,
    '',
    `Se ejecutaron **${totalTests.length} pruebas** automatizadas: ${totalTests.length - failedTests.length} pasaron y ${failedTests.length} fallaron.`,
    '',
    '## Suites ejecutadas',
    '',
    '| Suite | Ubicación | Pruebas | Pasan | Fallan | Duración | Ejecutada (UTC) |',
    '|---|---|---:|---:|---:|---:|---|',
    ...suiteRows,
    '',
    '## Casos por prioridad',
    '',
    '| Prioridad | Casos | Aprobados | Fallidos |',
    '|---|---:|---:|---:|',
    ...byPriority,
    '',
    '## Casos por tipo',
    '',
    '| Tipo | Casos |',
    '|---|---:|',
    ...byType,
    '',
    '## Casos que requieren atención',
    '',
    ...(problems.length
      ? ['| Caso | Estado | Detalle |', '|---|---|---|', ...problems.map((c) => {
          const detail = c.links.length
            ? c.links.filter((l) => l.outcome !== 'passed').map((l) => `${ICON[l.outcome]} ${l.file} › ${mdEscape(l.title)}`).join('<br>')
            : mdEscape(c.manual?.evidence ?? '');
          return `| ${c.id} · ${c.title} | ${STATUS_ICON[c.status] ?? ''} ${c.status} | ${detail} |`;
        })]
      : ['Ninguno.']),
    '',
    '## Pruebas fallidas',
    '',
    ...(failedTests.length ? failedTests.map((t) => `- ❌ ${KIND_LABEL[t.kind]} · \`${t.file}\` › ${t.title}`) : ['Ninguna.']),
    '',
    '## Defectos encontrados en esta versión',
    '',
    '| ID | Severidad | Estado | Defecto | Casos que lo cubren |',
    '|---|---|---|---|---|',
    ...catalog.DEFECTS.map((d) => `| ${d.id} | ${d.severity} | ${d.status} | **${d.title}.** ${d.detail} | ${d.cases.join(', ')} |`),
    '',
    '## Observaciones',
    '',
    '| ID | Estado | Observación | Casos |',
    '|---|---|---|---|',
    ...catalog.OBSERVATIONS.map((o) => `| ${o.id} | ${o.status ?? 'Abierta'} | **${o.title}.** ${o.detail} | ${o.cases.join(', ')} |`),
    '',
    '## Pruebas sin caso asociado',
    '',
    orphans.length
      ? `${orphans.length} pruebas ejecutadas no están enlazadas a ningún caso del catálogo (no afectan el resultado, pero conviene enlazarlas):\n\n${orphans.map((t) => `- ${KIND_LABEL[t.kind]} · \`${t.file}\` › ${t.title}`).join('\n')}`
      : 'Todas las pruebas ejecutadas están enlazadas a algún caso del catálogo.',
    '',
  ];
  writeFileSync(join(DOCS, 'validation-report.md'), report.join('\n'));
}

// ─────────────────────────── main ───────────────────────────

const catalog = await import(pathToFileURL(join(DOCS, 'catalog.mjs')).href);
const ids = catalog.CASES.map((c) => c.id);
const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
if (dupes.length) {
  console.error(`IDs duplicados en el catálogo: ${dupes.join(', ')}`);
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });
if (!REUSE) {
  for (const kind of ONLY) {
    if (!SUITES[kind]) throw new Error(`Suite desconocida: ${kind}`);
    process.stdout.write(`▶ ${SUITES[kind].label}… `);
    const run = await runSuite(kind);
    console.log(`${run.code === 0 ? 'ok' : `código ${run.code}`} (${fmtMs(run.ms)})`);
  }
}

// Las suites no ejecutadas en esta corrida aportan su último resultado guardado (con su fecha)
const results = Object.fromEntries(Object.keys(SUITES).map((k) => [k, readResults(k)]));
const ranAt = new Date().toISOString();
const { evaluated, orphans } = evaluate(catalog.CASES, results);
writeDocs({ evaluated, orphans, results, catalog, ranAt });

const tally = evaluated.reduce((acc, c) => ({ ...acc, [c.status]: (acc[c.status] ?? 0) + 1 }), {});
console.log(`\n${evaluated.length} casos: ${Object.entries(tally).map(([k, v]) => `${v} ${k.toLowerCase()}`).join(', ')}`);
console.log(`Pruebas sin caso: ${orphans.length}`);
for (const c of evaluated.filter((c) => c.status === 'Fallido' || c.status === 'Enlace roto')) {
  console.log(`  ${c.status.toUpperCase()}  ${c.id} ${c.title}`);
  for (const l of c.links.filter((l) => l.outcome !== 'passed')) console.log(`      ${l.outcome}: [${l.kind}] ${l.file} › ${l.title}`);
}
console.log('\nDocumentos: docs/qa/test-cases.md, docs/qa/test-cases.csv, docs/qa/validation-report.md');
process.exit(evaluated.some((c) => c.status === 'Fallido' || c.status === 'Enlace roto') ? 1 : 0);
