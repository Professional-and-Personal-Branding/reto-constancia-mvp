#!/usr/bin/env node
/**
 * Genera una página autocontenida del runbook (docs/runbook-despliegue.md) para publicarla como un
 * único archivo, con la plantilla scripts/lib/runbook-template.html (marked desde cdnjs).
 *
 * Uso: node scripts/build-runbook-artifact.mjs [--ref origin/main] [salida.html]
 *   --ref   lee el .md de esa referencia de git (por ejemplo origin/main) en vez del árbol de trabajo
 * Por defecto escribe docs/runbook-despliegue.standalone.html (ignorado por git).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const refAt = args.indexOf('--ref');
const ref = refAt >= 0 ? args[refAt + 1] : undefined;
const positional = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--ref');
const out = resolve(positional[0] ?? join(root, 'docs', 'runbook-despliegue.standalone.html'));

const markdown = ref
  ? execFileSync('git', ['show', `${ref}:docs/runbook-despliegue.md`], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    })
  : readFileSync(join(root, 'docs', 'runbook-despliegue.md'), 'utf8');

const template = readFileSync(join(root, 'scripts', 'lib', 'runbook-template.html'), 'utf8');
const marker = '/*__MD__*/""';
if (template.split(marker).length !== 2) throw new Error(`La plantilla debe tener exactamente un ${marker}`);

// "</" dentro de un <script> cerraría la etiqueta antes de tiempo
const embedded = JSON.stringify(markdown).replace(/<\//g, '<\\/');
writeFileSync(
  out,
  template.replace(marker, () => embedded),
);

console.log(
  `Runbook autocontenido: ${out} (${Math.round(Buffer.byteLength(readFileSync(out)) / 1024)} KB${ref ? `, desde ${ref}` : ''})`,
);
