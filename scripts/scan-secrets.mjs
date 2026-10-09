/**
 * Escaneo de secretos del repositorio. Sin dependencias: corre igual en Windows, en la CI y
 * antes de un commit.
 *
 *   node scripts/scan-secrets.mjs            # todos los archivos versionados
 *   node scripts/scan-secrets.mjs --staged   # solo lo que está en el índice (antes de commitear)
 *
 * Sale con código 1 si encuentra algo. Nunca imprime el valor completo, solo su comienzo.
 * Falsos positivos: agrega `secret-scan:allow` en la misma línea (con una razón) o, para valores
 * de prueba que se repiten, súmalos a PLACEHOLDER.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STAGED = process.argv.includes('--staged');
const MAX_BYTES = 1_000_000;

/** Archivos que nunca deben versionarse, sin mirar su contenido. */
const FORBIDDEN_FILE = [
  { name: 'archivo .env real', test: (f) => /^\.env(\.(?!example$)[\w.-]+)?$/.test(basename(f)) },
  {
    name: 'clave privada (archivo)',
    test: (f) => /\.(pem|key|p12|pfx|jks)$/i.test(f) || /^id_(rsa|dsa|ecdsa|ed25519)$/.test(basename(f)),
  },
  { name: 'credenciales de servicio', test: (f) => /(^|\/)(service-account|credentials)[\w.-]*\.json$/i.test(f) },
];

/** Contenido que no se inspecciona: binarios, bloqueos de dependencias y reportes generados. */
const SKIP_CONTENT = [
  /\.(png|jpe?g|gif|webp|ico|pdf|woff2?|ttf|zip|xlsx|mp4)$/i,
  /(^|\/)package-lock\.json$/,
  /^docs\/guia-plataforma\.standalone\.html$/,
  /^docs\/guia-capturas\//,
];

const PATTERNS = [
  { name: 'clave privada', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----/ },
  { name: 'clave de acceso de AWS', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: 'token de GitHub', re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b/ },
  { name: 'token de Slack', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'clave de API de Google', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'clave de API (sk-)', re: /\bsk-(?:ant-)?[A-Za-z0-9_-]{24,}\b/ },
  { name: 'URL de Cloudinary con secreto', re: /cloudinary:\/\/\d+:[^@\s'"`]{8,}@/ },
  { name: 'JWT', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  {
    name: 'URL de base de datos con contraseña en un servidor remoto',
    re: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^:\s/@'"`]+:[^@\s'"`]{3,}@(?!(?:localhost|127\.0\.0\.1|\[::1\]|postgres|db|host|HOST|USER)(?:[:/'"`\s]|$))[^\s'"`/]+/,
  },
];

/** Asignaciones del tipo CLAVE=valor con un valor largo que parece real. */
const ASSIGNMENT =
  /\b([A-Z][A-Z0-9_]*(?:SECRET|PASSWORD|PASSWD|TOKEN|API_KEY|PRIVATE_KEY|ACCESS_KEY)[A-Z0-9_]*)\s*[:=]\s*(['"]?)([^\s'"`#,;)}\]]{16,})\2/;

/** Valores de ejemplo, de CI o de prueba que no son secretos. */
const PLACEHOLDER =
  /ci_only|e2e-|cambia|change[-_ ]?me|changeme|example|ejemplo|placeholder|your[-_]|tu[-_]|dummy|fake|test[-_]?(secret|token|key|value)|xxx|\.\.\.|\*\*\*|<[^>]+>|\$\{|\$\(|\{\{|process\.env|config\.get|import\.meta|undefined|null|secret123|bytes|aleatori|random|generate|base64|openssl|hex|sha\d+|jwt_(refresh_)?secret$|_(SECRET|TOKEN|PASSWORD|KEY)$/i;

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function files() {
  const list = STAGED ? git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']) : git(['ls-files', '-z']);
  return list.split('\0').filter(Boolean);
}

const mask = (value) => `${value.slice(0, 4)}${'*'.repeat(Math.min(8, Math.max(3, value.length - 4)))}`;

const findings = [];
const add = (file, line, rule, value) => findings.push({ file, line, rule, value: mask(value) });

for (const file of files()) {
  const forbidden = FORBIDDEN_FILE.find((rule) => rule.test(file));
  if (forbidden) {
    add(file, 0, forbidden.name, basename(file));
    continue;
  }
  if (SKIP_CONTENT.some((re) => re.test(file))) continue;

  const path = join(ROOT, file);
  let size;
  try {
    size = statSync(path).size;
  } catch {
    continue; // borrado en el índice
  }
  if (size > MAX_BYTES) continue;

  const text = STAGED ? git(['show', `:${file}`]) : readFileSync(path, 'utf8');
  if (text.includes('\0')) continue;

  text.split(/\r?\n/).forEach((line, index) => {
    if (line.includes('secret-scan:allow')) return;
    for (const { name, re } of PATTERNS) {
      const m = line.match(re);
      // Una clave privada con `...` en la misma línea es un ejemplo de documentación
      if (m && !PLACEHOLDER.test(m[0]) && !(name === 'clave privada' && line.includes('...')))
        add(file, index + 1, name, m[0]);
    }
    const a = line.match(ASSIGNMENT);
    if (
      a &&
      !/^https?:\/\/[^@]*$/.test(a[3]) &&
      !PLACEHOLDER.test(a[3]) &&
      !PLACEHOLDER.test(a[1] + '=' + a[3]) &&
      extname(file) !== '.md'
    ) {
      add(file, index + 1, `valor sospechoso en ${a[1]}`, a[3]);
    }
  });
}

if (findings.length === 0) {
  console.log(`Escaneo de secretos: sin hallazgos (${STAGED ? 'índice' : 'archivos versionados'}).`);
  process.exit(0);
}
console.error(`Escaneo de secretos: ${findings.length} hallazgo(s)`);
for (const f of findings) {
  console.error(`  ${f.file}${f.line ? `:${f.line}` : ''}  ${f.rule}  ${f.value}`);
}
console.error('Si es un falso positivo, agrega `secret-scan:allow <razón>` en esa línea.');
process.exit(1);
