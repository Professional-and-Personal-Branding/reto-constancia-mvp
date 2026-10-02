/**
 * Pruebas de los helpers de días calendario. Sin framework: `node:test` con type stripping.
 *   npm test                      # en la zona horaria del sistema
 *   TZ=America/La_Paz npm test    # forzando UTC-4
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dayEndMs, formatDay, isoToday, toDayKey } from './dates.ts';

const MIDNIGHT_UTC = '2026-12-27T00:00:00.000Z';

test('toDayKey devuelve el día calendario del valor del backend', () => {
  assert.equal(toDayKey(MIDNIGHT_UTC), '2026-12-27');
  assert.equal(toDayKey('2026-12-27'), '2026-12-27');
});

test('formatDay no corre el día hacia atrás al oeste de UTC', () => {
  assert.match(formatDay(MIDNIGHT_UTC), /^27\b/);
  assert.match(formatDay('2026-01-01T00:00:00.000Z'), /^01\b/);
  assert.match(
    formatDay(MIDNIGHT_UTC, { day: '2-digit', month: 'short', year: 'numeric' }),
    /2026/,
  );
});

test('formatDay usa el locale es-BO', () => {
  assert.match(formatDay(MIDNIGHT_UTC).toLowerCase(), /dic/);
});

test('isoToday devuelve el día local con formato YYYY-MM-DD', () => {
  const now = new Date();
  const expected = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
  assert.equal(isoToday(), expected);
});

test('dayEndMs es la medianoche local al terminar el día (endDate inclusivo)', () => {
  const end = new Date(dayEndMs(MIDNIGHT_UTC));
  assert.equal(end.getFullYear(), 2026);
  assert.equal(end.getMonth(), 11);
  assert.equal(end.getDate(), 28);
  assert.equal(end.getHours(), 0);
  // Fin de mes y de año
  assert.equal(new Date(dayEndMs('2026-12-31T00:00:00.000Z')).getFullYear(), 2027);
});
