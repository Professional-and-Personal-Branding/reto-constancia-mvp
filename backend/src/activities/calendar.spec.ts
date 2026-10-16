import { ActivityStatus, ChallengeStatus, ExerciseType, Prisma } from '@prisma/client';

import { buildCalendar, CalendarActivityRow } from './calendar';
import { ChallengesService } from '../challenges/challenges.service';
import { ResultsService } from '../challenges/results.service';
import { PrismaService } from '../prisma/prisma.service';
import { localUploads } from '../../test/helpers/assets';

function challengeOf(start: string, end: string, validDays: number[], min = 0) {
  return {
    id: 'c1',
    status: ChallengeStatus.ACTIVE,
    startDate: new Date(`${start}T00:00:00.000Z`),
    endDate: new Date(`${end}T00:00:00.000Z`),
    validDays,
    minHeartRateMinutes: min,
  };
}

function row(date: string, over: Partial<CalendarActivityRow> = {}): CalendarActivityRow {
  return {
    id: `a-${date}`,
    date: new Date(`${date}T00:00:00.000Z`),
    status: ActivityStatus.PENDING,
    exerciseType: ExerciseType.RUNNING,
    durationMinutes: 40,
    distanceKm: null,
    heartRateMinutes: 25,
    hasHeartRateProof: true,
    rejectionReason: null,
    ...over,
  };
}

// Reglas reales de la plataforma (las mismas que usa `create`)
const challenges = new ChallengesService(
  {} as unknown as PrismaService,
  localUploads(),
  new ResultsService({} as unknown as PrismaService),
);

describe('buildCalendar (función pura del calendario del participante)', () => {
  const october = challengeOf('2025-10-01', '2025-10-31', [1, 2, 3, 4, 5, 6]);

  it('devuelve un día por fecha del período, en orden y con llaves YYYY-MM-DD', () => {
    const cal = buildCalendar(october, [], challenges);
    expect(cal.days).toHaveLength(31);
    expect(cal.days[0].date).toBe('2025-10-01');
    expect(cal.days[30].date).toBe('2025-10-31');
    expect(cal.days.map((d) => d.date)).toEqual([...cal.days.map((d) => d.date)].sort());
    expect(cal.startDate).toBe('2025-10-01');
    expect(cal.endDate).toBe('2025-10-31');
    expect(cal.status).toBe('ACTIVE');
    expect(cal.validDays).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('marca los domingos como descanso y cuenta los días válidos', () => {
    const cal = buildCalendar(october, [], challenges);
    const sunday = cal.days.find((d) => d.date === '2025-10-05')!;
    expect(sunday).toEqual({ date: '2025-10-05', valid: false, activity: null });
    expect(cal.days.find((d) => d.date === '2025-10-06')!.valid).toBe(true);
    expect(cal.summary).toEqual({ validDaysTotal: 27, registered: 0, validated: 0, pending: 0, rejected: 0 });
  });

  it('el resumen de la actividad tiene exactamente las llaves del contrato (sin fotos ni usuario)', () => {
    const cal = buildCalendar(
      october,
      [
        {
          ...row('2025-10-06', { status: ActivityStatus.VALIDATED, distanceKm: new Prisma.Decimal('5.20') }),
          photos: [{ url: 'x' }],
          user: { id: 'u1' },
          validatedById: 'admin',
        } as unknown as CalendarActivityRow,
      ],
      challenges,
    );
    const activity = cal.days.find((d) => d.date === '2025-10-06')!.activity!;
    expect(Object.keys(activity).sort()).toEqual(
      [
        'distanceKm',
        'durationMinutes',
        'exerciseType',
        'heartRateCompliant',
        'heartRateMinutes',
        'id',
        'rejectionReason',
        'status',
      ].sort(),
    );
    expect(activity.distanceKm).toBe('5.2');
    expect(activity.heartRateCompliant).toBe(true);
  });

  it('cuenta validadas, pendientes y rechazadas', () => {
    const cal = buildCalendar(
      october,
      [
        row('2025-10-06', { status: ActivityStatus.VALIDATED }),
        row('2025-10-07', { status: ActivityStatus.PENDING }),
        row('2025-10-08', { status: ActivityStatus.REJECTED, rejectionReason: 'Foto borrosa' }),
      ],
      challenges,
    );
    expect(cal.summary).toEqual({ validDaysTotal: 27, registered: 3, validated: 1, pending: 1, rejected: 1 });
    expect(cal.days.find((d) => d.date === '2025-10-08')!.activity).toMatchObject({
      status: 'REJECTED',
      rejectionReason: 'Foto borrosa',
    });
  });

  it('una actividad en un día que ya no es válido se conserva y se cuenta', () => {
    // 2025-10-04 es sábado; el admin quitó el sábado después de registrar
    const noSaturday = challengeOf('2025-10-01', '2025-10-31', [1, 2, 3, 4, 5]);
    const cal = buildCalendar(noSaturday, [row('2025-10-04')], challenges);
    const day = cal.days.find((d) => d.date === '2025-10-04')!;
    expect(day.valid).toBe(false);
    expect(day.activity?.status).toBe('PENDING');
    expect(cal.summary.registered).toBe(1);
    expect(cal.summary.pending).toBe(1);
  });

  it('omite una actividad fuera del período', () => {
    const cal = buildCalendar(october, [row('2025-09-30'), row('2025-11-01')], challenges);
    expect(cal.days.every((d) => d.activity === null)).toBe(true);
    expect(cal.summary.registered).toBe(0);
  });

  it('soporta un período que cruza de mes', () => {
    const cross = challengeOf('2025-10-27', '2025-11-03', [1, 2, 3, 4, 5, 6, 0]);
    const cal = buildCalendar(cross, [], challenges);
    expect(cal.days.map((d) => d.date)).toEqual([
      '2025-10-27',
      '2025-10-28',
      '2025-10-29',
      '2025-10-30',
      '2025-10-31',
      '2025-11-01',
      '2025-11-02',
      '2025-11-03',
    ]);
  });

  it('febrero bisiesto tiene 29 días y uno no bisiesto 28', () => {
    const all = [0, 1, 2, 3, 4, 5, 6];
    expect(buildCalendar(challengeOf('2028-02-01', '2028-02-29', all), [], challenges).days).toHaveLength(29);
    expect(buildCalendar(challengeOf('2027-02-01', '2027-02-28', all), [], challenges).days).toHaveLength(28);
    expect(buildCalendar(challengeOf('2028-02-01', '2028-02-29', all), [], challenges).days[28].date).toBe(
      '2028-02-29',
    );
  });

  it('heartRateCompliant sale de la regla de FC del reto', () => {
    const strict = challengeOf('2025-10-01', '2025-10-31', [1, 2, 3, 4, 5, 6], 30);
    const cal = buildCalendar(
      strict,
      [row('2025-10-06', { heartRateMinutes: 10 }), row('2025-10-07', { heartRateMinutes: 35 })],
      challenges,
    );
    expect(cal.days.find((d) => d.date === '2025-10-06')!.activity!.heartRateCompliant).toBe(false);
    expect(cal.days.find((d) => d.date === '2025-10-07')!.activity!.heartRateCompliant).toBe(true);
  });

  it('un día válido es exactamente uno que create aceptaría por período y día de la semana', () => {
    // `create` acepta una fecha cuando isWithinPeriod && isValidDay (ChallengesService).
    // Se recorre un margen de 3 días a cada lado del período, con una fecha cada día.
    const fixture = challengeOf('2025-10-03', '2025-11-04', [1, 3, 5, 6]);
    const cal = buildCalendar(fixture, [], challenges);
    const byDate = new Map(cal.days.map((d) => [d.date, d.valid]));
    for (let t = Date.UTC(2025, 9, 1); t <= Date.UTC(2025, 10, 7); t += 86_400_000) {
      const date = new Date(t);
      const key = date.toISOString().slice(0, 10);
      const accepted =
        challenges.isWithinPeriod(fixture as never, date) && challenges.isValidDay(fixture as never, date);
      if (byDate.has(key)) {
        expect(byDate.get(key)).toBe(accepted);
      } else {
        expect(accepted).toBe(false); // fuera del período: el calendario no lo lista y create lo rechaza
      }
    }
    expect(cal.days.some((d) => d.valid)).toBe(true);
    expect(cal.days.some((d) => !d.valid)).toBe(true);
  });
});
