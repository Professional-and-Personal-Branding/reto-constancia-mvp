/**
 * Pruebas de la lógica del calendario propio (spec participant-calendar). La validez de cada día
 * viene del servidor (`valid`); aquí solo se prueba la presentación derivada y las pistas.
 *   npm test
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  dateHint,
  dayState,
  HINT_ALREADY_REGISTERED,
  HINT_OUTSIDE_PERIOD,
  HINT_REST_DAY,
  resolveUploadDate,
  todayDuty,
  uploadDateBounds,
} from './calendar.ts';
import type { CalendarActivity, CalendarDay, MyCalendar } from './types.ts';

const activity = (status: CalendarActivity['status']): CalendarActivity => ({
  id: `a-${status}`,
  status,
  exerciseType: 'RUNNING',
  durationMinutes: 40,
  distanceKm: null,
  heartRateMinutes: 25,
  heartRateCompliant: true,
  rejectionReason: status === 'REJECTED' ? 'Foto borrosa' : null,
});

const day = (date: string, valid = true, act: CalendarActivity | null = null): CalendarDay => ({
  date,
  valid,
  activity: act,
});

function calendarOf(days: CalendarDay[]): MyCalendar {
  return {
    challengeId: 'c1',
    status: 'ACTIVE',
    startDate: days[0].date,
    endDate: days[days.length - 1].date,
    validDays: [1, 2, 3, 4, 5, 6],
    days,
    summary: { validDaysTotal: 0, registered: 0, validated: 0, pending: 0, rejected: 0 },
  };
}

// 2025-10-12 es domingo (descanso)
const october = calendarOf([
  day('2025-10-08'),
  day('2025-10-09'),
  day('2025-10-10', true, activity('PENDING')),
  day('2025-10-11'),
  day('2025-10-12', false),
  day('2025-10-13'),
  day('2025-10-14'),
]);

test('dayState: la actividad manda sobre cualquier otra condición', () => {
  const today = '2025-10-11';
  assert.equal(dayState(day('2025-10-06', true, activity('VALIDATED')), today), 'VALIDATED');
  assert.equal(dayState(day('2025-10-07', true, activity('PENDING')), today), 'PENDING');
  assert.equal(dayState(day('2025-10-08', true, activity('REJECTED')), today), 'REJECTED');
  // actividad en un día que dejó de ser válido o en el futuro: sigue mostrándose
  assert.equal(dayState(day('2025-10-12', false, activity('PENDING')), today), 'PENDING');
  assert.equal(dayState(day('2025-10-20', true, activity('PENDING')), today), 'PENDING');
});

test('dayState: descanso, sin registro, hoy abierto y futuro', () => {
  const today = '2025-10-15';
  assert.equal(dayState(day('2025-10-12', false), today), 'REST');
  assert.equal(dayState(day('2025-10-19', false), today), 'REST'); // descanso futuro sigue siendo descanso
  assert.equal(dayState(day('2025-10-09'), today), 'MISSED');
  assert.equal(dayState(day('2025-10-15'), today), 'TODAY_OPEN');
  assert.equal(dayState(day('2025-10-16'), today), 'FUTURE');
  assert.equal(dayState(day('2025-10-15', false), today), 'REST');
});

test('todayDuty: hoy ya registrado', () => {
  const duty = todayDuty(october, '2025-10-10');
  assert.equal(duty.kind, 'REGISTERED');
  assert.equal(duty.kind === 'REGISTERED' && duty.activity.status, 'PENDING');
});

test('todayDuty: día válido y abierto', () => {
  assert.deepEqual(todayDuty(october, '2025-10-11'), { kind: 'OPEN' });
});

test('todayDuty: día de descanso', () => {
  assert.deepEqual(todayDuty(october, '2025-10-12'), { kind: 'REST' });
});

test('todayDuty: antes del período y después del período', () => {
  assert.deepEqual(todayDuty(october, '2025-10-01'), { kind: 'BEFORE', startDate: '2025-10-08' });
  assert.deepEqual(todayDuty(october, '2025-10-15'), { kind: 'AFTER' });
});

test('uploadDateBounds: min es el inicio y max el menor entre el fin y hoy', () => {
  assert.deepEqual(uploadDateBounds(october, '2025-10-10'), { min: '2025-10-08', max: '2025-10-10' });
  assert.deepEqual(uploadDateBounds(october, '2025-12-01'), { min: '2025-10-08', max: '2025-10-14' });
  assert.deepEqual(uploadDateBounds(undefined, '2025-10-10'), { min: undefined, max: '2025-10-10' });
});

test('resolveUploadDate: ?date= solo si es un día del calendario; si no, hoy', () => {
  assert.equal(resolveUploadDate(october, '2025-10-09', '2025-10-11'), '2025-10-09');
  assert.equal(resolveUploadDate(october, '2025-11-30', '2025-10-11'), '2025-10-11');
  assert.equal(resolveUploadDate(october, 'basura', '2025-10-11'), '2025-10-11');
  assert.equal(resolveUploadDate(october, null, '2025-10-11'), '2025-10-11');
  assert.equal(resolveUploadDate(undefined, '2025-10-09', '2025-10-11'), '2025-10-11');
});

test('dateHint: descanso, fuera del período y ya registrado, con los textos de la API', () => {
  assert.equal(dateHint(october, '2025-10-12'), HINT_REST_DAY);
  assert.equal(dateHint(october, '2025-10-01'), HINT_OUTSIDE_PERIOD);
  assert.equal(dateHint(october, '2025-10-20'), HINT_OUTSIDE_PERIOD);
  assert.equal(dateHint(october, '2025-10-10'), HINT_ALREADY_REGISTERED);
  assert.equal(dateHint(october, '2025-10-11'), null);
  assert.equal(dateHint(october, ''), null);
  assert.equal(dateHint(undefined, '2025-10-12'), null);
  assert.equal(HINT_REST_DAY, 'Ese día es de descanso en este reto');
  assert.equal(HINT_OUTSIDE_PERIOD, 'La fecha está fuera del período del reto');
  assert.equal(HINT_ALREADY_REGISTERED, 'Ya registraste una actividad para ese día');
});
