/**
 * Pruebas del resumen de la inscripción en bloque. Sin framework: `node:test` con type stripping.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BULK_BATCH_SIZE,
  bulkSummary,
  chunk,
  mergeBulkResults,
  monthLabel,
  renewedMessage,
  rulesSummary,
} from './renewal.ts';
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

test('chunk: reparte la selección en lotes de a lo más 200', () => {
  const ids = Array.from({ length: 450 }, (_, i) => `u${i}`);
  const batches = chunk(ids, BULK_BATCH_SIZE);
  assert.deepEqual(
    batches.map((b) => b.length),
    [200, 200, 50],
  );
  assert.equal(BULK_BATCH_SIZE, 200);
  assert.deepEqual(chunk([], 200), []);
});

test('mergeBulkResults: combina los lotes en un solo resultado', () => {
  const merged = mergeBulkResults([
    result({ enrolled: [row('a')], skipped: [{ userId: 'x', reason: 'INACTIVE', message: 'm' }] }),
    result({ enrolled: [row('b'), row('c')], alreadyEnrolled: [row('d')] }),
  ]);
  assert.equal(merged.enrolled.length, 3);
  assert.equal(merged.alreadyEnrolled.length, 1);
  assert.equal(merged.skipped.length, 1);
  assert.equal(bulkSummary(merged), '3 inscritos · 1 ya estaba inscrito · 1 omitido: usuario inactivo');
  assert.equal(bulkSummary(mergeBulkResults([])), 'Sin cambios');
});

test('monthLabel: nombre del mes en español y año', () => {
  assert.equal(monthLabel(11, 2026), 'Noviembre 2026');
  assert.equal(monthLabel(1, 2027), 'Enero 2027');
});

test('renewedMessage: aviso de reto creado en borrador, con singular y plural', () => {
  assert.equal(renewedMessage('Reto Noviembre 2026', 2), 'Reto Noviembre 2026 creado en borrador con 2 inscritos');
  assert.equal(renewedMessage('Reto Noviembre 2026', 1), 'Reto Noviembre 2026 creado en borrador con 1 inscrito');
  assert.equal(renewedMessage('Reto Noviembre 2026', 0), 'Reto Noviembre 2026 creado en borrador con 0 inscritos');
});

test('rulesSummary: presupuesto automático, o ajustado con su monto', () => {
  const rules = {
    validDays: [1, 2, 3],
    minHeartRateMinutes: 25,
    feePerParticipant: '150',
    budgetTotal: null,
    budgetMode: 'auto' as const,
    currency: 'USD',
    prizeDescription: 'Zapatillas',
    pointsPerValidatedDay: 2,
    pointsPerKm: '0.5',
    minValidatedDaysToQualify: 10,
    maxWinners: 3,
    tiebreakRule: 'TOTAL_KM' as const,
  };
  const auto = rulesSummary(rules);
  assert.ok(auto.includes('Lun, Mar, Mié'));
  assert.ok(auto.includes('cuota 150 USD'));
  assert.ok(auto.includes('presupuesto automático'));
  assert.ok(auto.includes('3 ganadores'));
  assert.ok(auto.includes('desempate por más kilómetros'));
  const manual = rulesSummary({ ...rules, budgetTotal: '600', budgetMode: 'manual' });
  assert.ok(manual.includes('presupuesto ajustado 600 USD'));
  assert.ok(!manual.includes('presupuesto automático'));
  assert.ok(rulesSummary({ ...rules, maxWinners: 1 }).includes('1 ganador'));
});
