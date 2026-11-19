/**
 * Pruebas de la poda de binarios SWC del build de producción.
 *   node --test scripts/lib/prune.test.mjs
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runtimeIsGlibc, swcDirsToPrune } from './prune.mjs';

const NEXT_DIRS = [
  'env',
  'swc-linux-x64-gnu',
  'swc-linux-x64-musl',
  'swc-linux-arm64-gnu',
  'swc-linux-arm64-musl',
  'swc-darwin-arm64',
  'swc-win32-x64-msvc',
  'third-parties',
];

describe('poda de binarios SWC', () => {
  it('con glibc borra solo los binarios SWC de musl', () => {
    assert.deepEqual(swcDirsToPrune(NEXT_DIRS, true), ['swc-linux-x64-musl', 'swc-linux-arm64-musl']);
  });

  it('con musl borra solo los binarios SWC de gnu', () => {
    assert.deepEqual(swcDirsToPrune(NEXT_DIRS, false), ['swc-linux-x64-gnu', 'swc-linux-arm64-gnu']);
  });

  it('no toca otros paquetes ni plataformas y no falla si no hay binarios', () => {
    assert.deepEqual(swcDirsToPrune(['env', 'third-parties', 'swc-darwin-arm64'], true), []);
    assert.deepEqual(swcDirsToPrune([], false), []);
  });

  it('el runtime se detecta como un booleano', () => {
    assert.equal(typeof runtimeIsGlibc(), 'boolean');
  });
});
