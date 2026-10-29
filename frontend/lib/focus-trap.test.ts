/**
 * Pruebas de la aritmética del atrapa-foco. Sin framework: `node:test` con type stripping.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextFocusIndex } from './focus-trap.ts';

test('nextFocusIndex: hacia delante avanza y da la vuelta al llegar al último', () => {
  assert.equal(nextFocusIndex(0, 3, false), 1);
  assert.equal(nextFocusIndex(1, 3, false), 2);
  assert.equal(nextFocusIndex(2, 3, false), 0);
});

test('nextFocusIndex: hacia atrás retrocede y da la vuelta al llegar al primero', () => {
  assert.equal(nextFocusIndex(2, 3, true), 1);
  assert.equal(nextFocusIndex(1, 3, true), 0);
  assert.equal(nextFocusIndex(0, 3, true), 2);
});

test('nextFocusIndex: sin foco en ningún control (-1) va al primero o al último', () => {
  assert.equal(nextFocusIndex(-1, 4, false), 0);
  assert.equal(nextFocusIndex(-1, 4, true), 3);
});

test('nextFocusIndex: sin controles devuelve -1', () => {
  assert.equal(nextFocusIndex(-1, 0, false), -1);
  assert.equal(nextFocusIndex(0, 0, true), -1);
});

test('nextFocusIndex: con un solo control se queda en él', () => {
  assert.equal(nextFocusIndex(0, 1, false), 0);
  assert.equal(nextFocusIndex(0, 1, true), 0);
});
