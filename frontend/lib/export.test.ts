/** Pruebas del nombre del acta. Sin framework: `node:test` con type stripping. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { exportFilename } from './export.ts';

test('el nombre del acta sale del año y el mes con dos dígitos', () => {
  assert.equal(exportFilename(2026, 5), 'acta-reto-2026-05.csv');
  assert.equal(exportFilename(2026, 12), 'acta-reto-2026-12.csv');
});
