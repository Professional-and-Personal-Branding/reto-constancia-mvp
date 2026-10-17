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
  currentStreak,
  resolveUploadDate,
  todayDuty,
  uploadDateBounds,
  weeksOf,
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

// ----- "Mi mes": semanas y racha (spec participant-calendar, incremento 2) -----

/** Días consecutivos desde `from` (YYYY-MM-DD) con la forma dada por `make`. */
function run(from: string, count: number, make: (date: string, index: number) => CalendarDay): CalendarDay[] {
  const out: CalendarDay[] = [];
  const start = new Date(`${from}T12:00:00Z`);
  for (let i = 0; i < count; i++) {
    const d = new Date(start.getTime() + i * 86_400_000);
    out.push(make(d.toISOString().slice(0, 10), i));
  }
  return out;
}

test('weeksOf: las semanas empiezan en lunes y los extremos van en blanco', () => {
  // 2025-10-01 es miércoles y 2025-10-31 es viernes
  const weeks = weeksOf(run('2025-10-01', 31, (d) => day(d)));
  assert.equal(weeks.length, 5);
  assert.ok(weeks.every((w) => w.length === 7));
  assert.deepEqual(weeks[0].map((c) => c?.date ?? null), [null, null, '2025-10-01', '2025-10-02', '2025-10-03', '2025-10-04', '2025-10-05']);
  assert.equal(weeks[1][0]?.date, '2025-10-06'); // lunes
  assert.deepEqual(weeks[4].map((c) => c?.date ?? null), ['2025-10-27', '2025-10-28', '2025-10-29', '2025-10-30', '2025-10-31', null, null]);
});

test('weeksOf: un período que empieza en lunes y termina en domingo no tiene blancos', () => {
  const weeks = weeksOf(run('2025-10-06', 14, (d) => day(d)));
  assert.equal(weeks.length, 2);
  assert.ok(weeks.flat().every((c) => c !== null));
});

test('weeksOf: un período que cruza de mes conserva el orden y no inventa días', () => {
  // jueves 2025-10-30 a lunes 2025-11-03
  const weeks = weeksOf(run('2025-10-30', 5, (d) => day(d)));
  assert.equal(weeks.length, 2);
  assert.deepEqual(weeks[0].map((c) => c?.date ?? null), [null, null, null, '2025-10-30', '2025-10-31', '2025-11-01', '2025-11-02']);
  assert.deepEqual(weeks[1].map((c) => c?.date ?? null), ['2025-11-03', null, null, null, null, null, null]);
  assert.equal(weeksOf([]).length, 0);
});

// Semana de prueba: viernes 10-03 a martes 10-07; domingo 10-05 es descanso
const sundayRest = (date: string, act: CalendarActivity | null = null) => day(date, date !== '2025-10-05', act);

test('currentStreak: cuenta pendientes y validados saltando el descanso, y hoy abierto no la rompe', () => {
  const days = [
    sundayRest('2025-10-03', activity('VALIDATED')), // viernes
    sundayRest('2025-10-04', activity('VALIDATED')), // sábado
    sundayRest('2025-10-05'), // domingo: descanso
    sundayRest('2025-10-06', activity('PENDING')), // lunes
    sundayRest('2025-10-07'), // martes: hoy sin actividad
  ];
  assert.equal(currentStreak(days, '2025-10-07'), 3);
});

test('currentStreak: hoy con actividad suma', () => {
  const days = [sundayRest('2025-10-06', activity('VALIDATED')), sundayRest('2025-10-07', activity('PENDING'))];
  assert.equal(currentStreak(days, '2025-10-07'), 2);
});

test('currentStreak: un día rechazado la termina', () => {
  const days = [
    sundayRest('2025-10-03', activity('VALIDATED')),
    sundayRest('2025-10-04', activity('VALIDATED')),
    sundayRest('2025-10-06', activity('REJECTED')),
    sundayRest('2025-10-07', activity('VALIDATED')),
    sundayRest('2025-10-08'),
  ];
  assert.equal(currentStreak(days, '2025-10-08'), 1);
  assert.equal(currentStreak(days.slice(0, 3), '2025-10-06'), 0);
});

test('currentStreak: un día válido pasado sin registro la termina', () => {
  const days = [
    sundayRest('2025-10-03', activity('VALIDATED')),
    sundayRest('2025-10-04'), // sin registro
    sundayRest('2025-10-06', activity('VALIDATED')),
    sundayRest('2025-10-07'),
  ];
  assert.equal(currentStreak(days, '2025-10-07'), 1);
});

test('currentStreak: sin actividades, al inicio del reto y antes del período vale 0', () => {
  const days = run('2025-10-06', 5, (d) => day(d));
  assert.equal(currentStreak(days, '2025-10-08'), 0);
  assert.equal(currentStreak(days, '2025-10-06'), 0);
  assert.equal(currentStreak(days, '2025-10-01'), 0);
});

test('currentStreak: los días futuros no cuentan y hoy pasado el período cuenta hacia atrás', () => {
  const days = [
    sundayRest('2025-10-06', activity('VALIDATED')),
    sundayRest('2025-10-07', activity('VALIDATED')),
    sundayRest('2025-10-08', activity('PENDING')), // registrado por adelantado
  ];
  assert.equal(currentStreak(days, '2025-10-07'), 2);
  assert.equal(currentStreak(days, '2025-11-30'), 3);
});
