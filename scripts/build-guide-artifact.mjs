#!/usr/bin/env node
/**
 * Genera una versión autocontenida de docs/guia-plataforma.html con las capturas embebidas
 * (data URIs), para publicarla como un único archivo.
 *
 * Uso: node scripts/build-guide-artifact.mjs [salida.html]
 * Por defecto escribe docs/guia-plataforma.standalone.html (ignorado por git).
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const docs = join(root, 'docs');
const shotsDir = join(docs, 'guia-capturas');
const out = resolve(process.argv[2] ?? join(docs, 'guia-plataforma.standalone.html'));

const data = {};
for (const file of readdirSync(shotsDir).filter((f) => f.endsWith('.jpg')).sort()) {
  data[file] = 'data:image/jpeg;base64,' + readFileSync(join(shotsDir, file)).toString('base64');
}

const html = readFileSync(join(docs, 'guia-plataforma.html'), 'utf8');
const marker = '<script>';
const at = html.lastIndexOf(marker);
if (at < 0) throw new Error('No se encontró el script principal de la guía');
const inject = '<script>window.SHOT_DATA = ' + JSON.stringify(data) + ';</script>\n';
writeFileSync(out, html.slice(0, at) + inject + html.slice(at));

const kb = Math.round(Buffer.byteLength(readFileSync(out)) / 1024);
console.log(`Guía autocontenida: ${out} (${Object.keys(data).length} capturas, ${kb} KB)`);
