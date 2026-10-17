import Link from 'next/link';
import { currentStreak, dayState, weeksOf } from '@/lib/calendar';
import type { DayState } from '@/lib/calendar';
import { formatDay } from '@/lib/dates';
import type { CalendarDay, MyCalendar } from '@/lib/types';

/**
 * "Mi mes" (spec participant-calendar): grilla del período en semanas que empiezan en lunes.
 * Cada estado se comunica con color, glifo y texto (nunca solo color). La validez de cada día
 * viene del servidor; aquí solo se pinta. La racha es solo de visualización.
 */

const STATES: Record<DayState, { glyph: string; label: string; classes: string }> = {
  VALIDATED: { glyph: '✓', label: 'Validado', classes: 'bg-ok/15 text-ok border-ok/40' },
  PENDING: { glyph: '•', label: 'Pendiente', classes: 'bg-warn/15 text-warn border-warn/40' },
  REJECTED: { glyph: '✕', label: 'Rechazado', classes: 'bg-bad/15 text-bad border-bad/40' },
  MISSED: { glyph: '!', label: 'Sin registro', classes: 'text-bad border-bad/50 border-dashed' },
  TODAY_OPEN: { glyph: '○', label: 'Hoy', classes: 'bg-accent/15 text-accent border-accent' },
  REST: { glyph: '·', label: 'Descanso', classes: 'bg-bg-elev text-ink-mute border-transparent' },
  FUTURE: { glyph: '—', label: 'Por venir', classes: 'text-ink-mute border-line' },
};

const LEGEND: DayState[] = ['VALIDATED', 'PENDING', 'REJECTED', 'MISSED', 'TODAY_OPEN', 'REST', 'FUTURE'];

const WEEKDAYS = [
  ['Lun', 'lunes'],
  ['Mar', 'martes'],
  ['Mié', 'miércoles'],
  ['Jue', 'jueves'],
  ['Vie', 'viernes'],
  ['Sáb', 'sábado'],
  ['Dom', 'domingo'],
];

function fullDate(date: string): string {
  return formatDay(date, { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '');
}

/** Destino de un día: registrar si falta (solo reto activo) o la fila de su actividad. */
function hrefOf(day: CalendarDay, state: DayState, active: boolean): string | null {
  if (!active) return null;
  if (day.activity) return `#actividad-${day.activity.id}`;
  if (state === 'MISSED' || state === 'TODAY_OPEN') return `/dashboard/upload?date=${day.date}`;
  return null;
}

function Cell({ day, today, active }: { day: CalendarDay; today: string; active: boolean }) {
  const state = dayState(day, today);
  const { glyph, label, classes } = STATES[state];
  const isToday = day.date === today;
  const href = hrefOf(day, state, active);
  const dayNumber = Number(day.date.slice(8, 10));
  // Etiqueta de mes en el primer día de cada mes (períodos que cruzan de mes)
  const monthLabel = dayNumber === 1 ? formatDay(day.date, { month: 'short' }).replace('.', '') : null;

  const body = (
    <>
      <span aria-hidden="true" className="text-[10px] leading-none uppercase">
        {monthLabel}
      </span>
      <span aria-hidden="true" className="text-sm font-semibold leading-tight">
        {dayNumber}
      </span>
      <span aria-hidden="true" className="text-xs leading-none">
        {glyph}
      </span>
      <span className="sr-only">{`${fullDate(day.date)}: ${label.toLowerCase()}`}</span>
    </>
  );
  const box = `flex flex-col items-center justify-center w-full min-h-11 rounded-md border ${classes}`;

  return (
    <td className="p-px sm:p-0.5" aria-current={isToday ? 'date' : undefined}>
      {href ? (
        href.startsWith('#') ? (
          <a href={href} className={`${box} hover:opacity-80`}>
            {body}
          </a>
        ) : (
          <Link href={href} className={`${box} hover:opacity-80`}>
            {body}
          </Link>
        )
      ) : (
        <div className={box}>{body}</div>
      )}
    </td>
  );
}

export function MyMonth({
  calendar,
  challengeName,
  today,
}: {
  calendar: MyCalendar;
  challengeName: string;
  today: string;
}) {
  const weeks = weeksOf(calendar.days);
  const streak = currentStreak(calendar.days, today);
  const active = calendar.status === 'ACTIVE';

  return (
    <section aria-labelledby="mi-mes-titulo">
      <h2 id="mi-mes-titulo" className="display text-2xl mb-4 tracking-wider">
        Mi mes
      </h2>
      <div className="card p-2 sm:p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-3 text-sm">
          <p>
            <span className="font-semibold">
              {calendar.summary.registered} de {calendar.summary.validDaysTotal}
            </span>{' '}
            días válidos registrados
          </p>
          <p>
            Racha:{' '}
            <span className="font-semibold">
              {streak} {streak === 1 ? 'día' : 'días'}
            </span>
          </p>
        </div>
        <table className="w-full table-fixed border-collapse">
          <caption className="sr-only">Mi mes: {challengeName}</caption>
          <thead>
            <tr>
              {WEEKDAYS.map(([short, full]) => (
                <th key={short} scope="col" className="text-xs font-medium text-ink-dim pb-1">
                  <abbr title={full} aria-label={full} className="no-underline">
                    {short}
                  </abbr>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week, i) => (
              <tr key={i}>
                {week.map((day, j) =>
                  day ? (
                    <Cell key={day.date} day={day} today={today} active={active} />
                  ) : (
                    <td key={`b${j}`} className="p-px sm:p-0.5" />
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
        <ul aria-label="Leyenda de Mi mes" className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-ink-dim">
          {LEGEND.map((state) => (
            <li key={state} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className={`inline-flex items-center justify-center w-5 h-5 rounded border text-[11px] ${STATES[state].classes}`}
              >
                {STATES[state].glyph}
              </span>
              {STATES[state].label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
