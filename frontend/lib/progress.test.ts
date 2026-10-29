/**
 * Pruebas de "Mi avance" (spec participant-calendar). Sin framework: `node:test` con type stripping.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { qualifiesLike, qualifyProgress, progressMessage } from './progress.ts';
import type { CalendarDay } from './types.ts';

function day(date: string, valid: boolean, status?: 'PENDING' | 'VALIDATED' | 'REJECTED'): CalendarDay {
  return {
    date,
    valid,
    activity: status ? ({ id: `a-${date}`, status } as CalendarDay['activity']) : null,
  };
}

function openDays(n: number): CalendarDay[] {
  return Array.from({ length: n }, (_, i) => day(`2025-06-${String(i + 1).padStart(2, '0')}`, true));
}

function row(validatedDays: number, pendingDays: number, score = validatedDays, qualified = false) {
  return { validatedDays, pendingDays, score, qualified };
}

test('Mi avance: la tabla de paridad coincide con la regla del servidor', () => {
  const cases = JSON.parse(
    readFileSync(new URL('../../backend/src/challenges/qualification-parity.json', import.meta.url), 'utf8'),
  ) as { name: string; min: number; validatedDays: number; score: number; qualified: boolean }[];
  assert.ok(cases.length >= 7);
  for (const c of cases) {
    assert.equal(qualifiesLike(c.min, c.validatedDays, c.score), c.qualified, c.name);
  }
});

test('Mi avance: con la fila calificada el estado es QUALIFIED y el texto se confirma al cierre', () => {
  const p = qualifyProgress({ min: 3, row: row(3, 0, 3, true), days: [] });
  assert.equal(p.state, 'QUALIFIED');
  assert.equal(progressMessage(p).main, 'Ya alcanzas el mínimo; se confirma al cierre.');
  assert.equal(progressMessage(p).detail, null);
  assert.equal(p.validated, 3);
  assert.equal(p.target, 3);
});

test('Mi avance: alcanzable con pendientes y días abiertos, en singular y plural', () => {
  const plural = qualifyProgress({ min: 12, row: row(8, 1), days: openDays(9) });
  assert.equal(plural.state, 'REACHABLE');
  assert.equal(plural.missing, 4);
  assert.deepEqual(progressMessage(plural), {
    main: 'Te faltan 4 días validados para el mínimo; aún puedes llegar.',
    detail: 'Tienes 1 pendiente de validar y 9 días válidos sin registrar en el período.',
  });
  const singular = qualifyProgress({ min: 3, row: row(2, 2), days: openDays(1) });
  assert.deepEqual(progressMessage(singular), {
    main: 'Te falta 1 día validado para el mínimo; aún puedes llegar.',
    detail: 'Tienes 2 pendientes de validar y 1 día válido sin registrar en el período.',
  });
});

test('Mi avance: un día rechazado cuenta como abierto y uno pendiente no', () => {
  const days = [day('2025-06-01', true), day('2025-06-02', true, 'REJECTED'), day('2025-06-03', true, 'PENDING')];
  const p = qualifyProgress({ min: 3, row: row(1, 0), days });
  assert.equal(p.open, 2);
  assert.equal(p.state, 'REACHABLE');
  assert.equal(progressMessage(p).main, 'Te faltan 2 días validados para el mínimo; aún puedes llegar.');
  // Los días de descanso y los ya validados no cuentan
  const rest = qualifyProgress({
    min: 3,
    row: row(1, 0),
    days: [day('2025-06-01', false), day('2025-06-02', true, 'VALIDATED')],
  });
  assert.equal(rest.open, 0);
});

test('Mi avance: fuera de alcance cuando faltan más días que pendientes y abiertos', () => {
  const p = qualifyProgress({ min: 12, row: row(5, 0), days: openDays(3) });
  assert.equal(p.state, 'OUT_OF_REACH');
  assert.equal(
    progressMessage(p).main,
    'Con los días que quedan no alcanzarías el mínimo de 12 días validados. Cada actividad sigue sumando puntos.',
  );
  assert.equal(progressMessage(p).detail, null);
  const one = qualifyProgress({ min: 1, row: row(0, 0), days: [] });
  assert.equal(
    progressMessage(one).main,
    'Con los días que quedan no alcanzarías el mínimo de 1 día validado. Cada actividad sigue sumando puntos.',
  );
});

test('Mi avance: con mínimo 0 la meta es 1 día validado', () => {
  const p = qualifyProgress({ min: 0, row: row(0, 0), days: openDays(2) });
  assert.equal(p.target, 1);
  assert.equal(p.missing, 1);
  assert.equal(p.state, 'REACHABLE');
  assert.equal(progressMessage(p).main, 'Te falta 1 día validado para el mínimo; aún puedes llegar.');
});

test('Mi avance: días alcanzados con puntaje 0 dan NO_SCORE', () => {
  const p = qualifyProgress({ min: 2, row: row(2, 0, 0, false), days: [] });
  assert.equal(p.state, 'NO_SCORE');
  assert.equal(
    progressMessage(p).main,
    'Alcanzas el mínimo de días, pero tu puntaje todavía es 0; se confirma al cierre.',
  );
});

test('Mi avance: el porcentaje no supera 100', () => {
  const p = qualifyProgress({ min: 3, row: row(5, 0, 5, true), days: [] });
  assert.equal(p.percent, 100);
  assert.equal(qualifyProgress({ min: 3, row: row(1, 0), days: openDays(5) }).percent, 33);
  assert.equal(qualifyProgress({ min: 0, row: row(0, 0), days: [] }).percent, 0);
});
