/**
 * Pruebas del resumen de la inscripción en bloque. Sin framework: `node:test` con type stripping.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bulkSummary } from './renewal.ts';
import type { BulkEnrollResult } from './types.ts';

const row = (id: string, name = id) => ({ userId: id, name, email: `${id}@x` });
const result = (partial: Partial<BulkEnrollResult>): BulkEnrollResult => ({
  enrolled: [],
  alreadyEnrolled: [],
  skipped: [],
  ...partial,
});

test('bulkSummary: inscritos, ya inscritos y omitido con nombre y motivo', () => {
  const summary = bulkSummary(
    result({
      enrolled: [row('a'), row('b'), row('c')],
      alreadyEnrolled: [row('d')],
      skipped: [{ userId: 'luis', reason: 'INACTIVE', message: 'El usuario está inactivo' }],
    }),
    { luis: 'Luis' },
  );
  assert.equal(summary, '3 inscritos · 1 ya estaba inscrito · 1 omitido: Luis (usuario inactivo)');
});

test('bulkSummary: singular y plural', () => {
  assert.equal(bulkSummary(result({ enrolled: [row('a')] })), '1 inscrito');
  assert.equal(bulkSummary(result({ enrolled: [row('a'), row('b')] })), '2 inscritos');
  assert.equal(bulkSummary(result({ alreadyEnrolled: [row('a')] })), '1 ya estaba inscrito');
  assert.equal(bulkSummary(result({ alreadyEnrolled: [row('a'), row('b')] })), '2 ya estaban inscritos');
});

test('bulkSummary: varios omitidos se listan con su motivo', () => {
  const summary = bulkSummary(
    result({
      skipped: [
        { userId: 'luis', reason: 'INACTIVE', message: 'El usuario está inactivo' },
        { userId: 'x', reason: 'NOT_FOUND', message: 'Usuario no encontrado' },
      ],
    }),
    { luis: 'Luis', x: 'Xavier' },
  );
  assert.equal(summary, '2 omitidos: Luis (usuario inactivo), Xavier (usuario no encontrado)');
});

test('bulkSummary: un usuario desconocido sin nombre muestra solo el motivo', () => {
  const summary = bulkSummary(
    result({ skipped: [{ userId: 'zz', reason: 'NOT_FOUND', message: 'Usuario no encontrado' }] }),
  );
  assert.equal(summary, '1 omitido: usuario no encontrado');
});

test('bulkSummary: omite las partes en cero y no deja el resumen vacío', () => {
  assert.equal(
    bulkSummary(result({ enrolled: [row('a')], alreadyEnrolled: [row('b')] })),
    '1 inscrito · 1 ya estaba inscrito',
  );
  assert.equal(bulkSummary(result({})), 'Sin cambios');
});
