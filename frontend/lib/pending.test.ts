/**
 * Pruebas de la insignia de pendientes de "Validar" (spec challenge-lifecycle). `node:test` con type stripping.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pendingBadgeLabel } from './pending.ts';

test('insignia de pendientes: sin número en 0, el valor hasta 99 y "99+" por encima', () => {
  assert.equal(pendingBadgeLabel(0), null);
  assert.equal(pendingBadgeLabel(-1), null);
  assert.equal(pendingBadgeLabel(1), '1');
  assert.equal(pendingBadgeLabel(99), '99');
  assert.equal(pendingBadgeLabel(100), '99+');
  assert.equal(pendingBadgeLabel(250), '99+');
});
