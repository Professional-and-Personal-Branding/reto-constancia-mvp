/**
 * Formato con Prettier (config en .prettierrc.json). El código existente nunca se formateó con
 * Prettier: casi todos los archivos difieren, y formatearlos de golpe taparía los cambios reales
 * en cada diff. Por eso el comando exige el formato solo a lo que se agrega, y deja formatear a
 * pedido lo que se toca.
 *
 *   node scripts/format.mjs                # verifica los archivos NUEVOS respecto de la rama base
 *   node scripts/format.mjs --changed      # verifica también los archivos modificados
 *   node scripts/format.mjs --write        # formatea lo que se verificaría
 *   node scripts/format.mjs --write ruta.ts otra.tsx   # formatea esos archivos
 *   node scripts/format.mjs --base origin/main         # otra rama base (por defecto origin/develop)
 *
 * Sale con código 1 si algún archivo verificado no cumple. Prettier se toma de backend/node_modules
 * (cd backend && npm ci).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const CHANGED = args.includes('--changed');
const baseIndex = args.indexOf('--base');
const explicitBase = baseIndex >= 0 ? args[baseIndex + 1] : undefined;
const explicitFiles = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--base');

const CODE = /\.(ts|tsx|mjs|js|css)$/;

function git(gitArgs) {
  return execFileSync('git', gitArgs, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function resolveBase() {
  for (const ref of [explicitBase, 'origin/develop', 'develop', 'origin/main', 'main']) {
    if (!ref) continue;
    try {
      git(['rev-parse', '--verify', '--quiet', ref]);
      return ref;
    } catch {
      /* siguiente */
    }
  }
  throw new Error('No encontré una rama base (origin/develop, develop, origin/main, main).');
}

function targetFiles() {
  if (explicitFiles.length) return explicitFiles;
  const base = resolveBase();
  const filter = CHANGED ? 'AM' : 'A';
  const lines = [
    ...git(['diff', '--name-only', `--diff-filter=${filter}`, `${base}...HEAD`]).split('\n'),
    ...git(['diff', '--name-only', `--diff-filter=${filter}`, 'HEAD']).split('\n'),
    ...git(['ls-files', '--others', '--exclude-standard']).split('\n'),
  ];
  return [...new Set(lines.map((l) => l.trim()).filter(Boolean))];
}

const prettierEntry = join(ROOT, 'backend', 'node_modules', 'prettier', 'index.mjs');
if (!existsSync(prettierEntry)) {
  console.error('Falta Prettier. Instala las dependencias del backend: cd backend && npm ci');
  process.exit(1);
}
const prettier = await import(pathToFileURL(prettierEntry).href);

const failed = [];
let checked = 0;
for (const file of targetFiles()) {
  const path = join(ROOT, file);
  if (!CODE.test(file) || !existsSync(path)) continue;
  const info = await prettier.getFileInfo(path, { ignorePath: join(ROOT, '.prettierignore') });
  if (info.ignored || !info.inferredParser) continue;

  const source = readFileSync(path, 'utf8');
  const options = { ...(await prettier.resolveConfig(path)), filepath: path };
  checked++;
  if (await prettier.check(source, options)) continue;
  if (WRITE) {
    writeFileSync(path, await prettier.format(source, options));
    console.log(`formateado  ${file}`);
  } else {
    failed.push(file);
  }
}

if (failed.length) {
  console.error(`Formato: ${failed.length} archivo(s) sin el formato de Prettier`);
  for (const f of failed) console.error(`  ${f}`);
  console.error('Corrige con: node scripts/format.mjs --write <archivo>');
  process.exit(1);
}
console.log(
  `Formato: ${WRITE ? 'listo' : 'sin diferencias'} (${checked} archivo(s) revisados${CHANGED ? ', nuevos y modificados' : ', solo nuevos'}).`,
);
