'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useActiveChallenge } from '@/lib/use-active-challenge';
import { dayEndMs, formatDay, isoToday, toDayKey } from '@/lib/dates';
import { ACCEPT, uploadToCloudinary } from '@/lib/cloudinary';
import { amountOwed, formatUploadDate } from '@/lib/payment';
import { canRegisterAgain, todayDuty } from '@/lib/calendar';
import { MyMonth } from '@/components/my-month';
import type {
  ChallengeParticipant,
  MyParticipation,
  DailyActivity,
  ChallengeResults,
  MyCalendar,
} from '@/lib/types';

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/** Etiqueta del estado de pago propio; el servidor decide el estado (payment-reconciliation). */
function paymentLabel(me: MyParticipation, fee: string, currency: string): string {
  switch (me.paymentStatus) {
    case 'paid':
      return 'pagado';
    case 'in_review': {
      const date = me.paymentProofUploadedAt ? ` · subido el ${formatUploadDate(me.paymentProofUploadedAt)}` : '';
      const recorded = me.paid ? ` · Registrado ${Number(me.amountPaid ?? 0)} de ${Number(fee)} ${currency}` : '';
      return `comprobante en revisión${date}${recorded}`;
    }
    case 'partial':
      return `pago parcial · pagaste ${Number(me.amountPaid ?? 0)} de ${Number(fee)} ${currency}, faltan ${amountOwed(parseFloat(fee), me.amountPaid)}`;
    default:
      return 'pendiente de pago';
  }
}

function formatDate(iso: string): string {
  return formatDay(iso, { day: '2-digit', month: 'short' });
}

function useCountdown(endDate?: string): string {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  if (!endDate) return '—';

  // endDate es el último día válido (inclusivo): el reto termina al acabar ese día
  const remainingMs = dayEndMs(endDate) - now;
  if (remainingMs <= 0) return 'Finalizado';

  const totalMinutes = Math.floor(remainingMs / 60_000);
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;

  return `${days}d ${hours}h ${minutes}m`;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const paymentInputRef = useRef<HTMLInputElement>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const { challenge } = useActiveChallenge();

  const { data: activities } = useQuery<DailyActivity[]>({
    queryKey: ['activities', 'me', challenge?.id],
    queryFn: () =>
      api<DailyActivity[]>(
        `/activities/me${challenge ? `?challengeId=${challenge.id}` : ''}`,
      ),
    enabled: !!challenge,
  });

  // Calendario propio (spec participant-calendar): solo si participo; si no, la API respondería 403.
  // La clave cuelga de ['activities'], así que subir o retirar una actividad lo refresca.
  const { data: calendar } = useQuery<MyCalendar>({
    queryKey: ['activities', 'calendar', challenge?.id],
    queryFn: () => api<MyCalendar>(`/activities/me/calendar?challengeId=${challenge!.id}`),
    enabled: !!challenge && !!challenge.me,
  });

  const { data: results } = useQuery<ChallengeResults>({
    queryKey: ['results', challenge?.id],
    queryFn: () => api<ChallengeResults>(`/challenges/${challenge!.id}/results`),
    enabled: !!challenge,
  });

  // Retirar una actividad propia pendiente o rechazada (la API no deja retirar una validada)
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  // Día de la actividad rechazada recién retirada: ofrece registrarlo de nuevo
  const [withdrawnDate, setWithdrawnDate] = useState<string | null>(null);
  const withdrawMut = useMutation({
    mutationFn: (target: { id: string; date: string; rejected: boolean }) =>
      api(`/activities/${target.id}`, { method: 'DELETE' }),
    onSuccess: (_data, target) => {
      setWithdrawError(null);
      setWithdrawnDate(target.rejected ? toDayKey(target.date) : null);
      qc.invalidateQueries({ queryKey: ['activities'] });
      qc.invalidateQueries({ queryKey: ['results'] });
    },
    onError: (e) => {
      setWithdrawnDate(null);
      const body = (e as ApiError).body as { message?: string | string[] } | null;
      const msg = body?.message ?? (e instanceof Error ? e.message : 'No se pudo retirar la actividad');
      setWithdrawError(Array.isArray(msg) ? msg.join(', ') : msg);
      // La actividad pudo cambiar mientras tanto (por ejemplo, validada): se refresca la lista
      qc.invalidateQueries({ queryKey: ['activities'] });
    },
  });

  const uploadPaymentMut = useMutation({
    mutationFn: async (file: File) => {
      if (!challenge) throw new Error('Sin reto activo');
      const proof = await uploadToCloudinary(file, challenge.id, 'payment-proof');

      return api<ChallengeParticipant>(
        `/challenges/${challenge.id}/participants/me/payment-proof`,
        {
          method: 'PATCH',
          body: {
            paymentProofUrl: proof.url,
            paymentProofCloudinaryId: proof.cloudinaryId,
          },
        },
      );
    },
    onSuccess: () => {
      setPaymentError(null);
      qc.invalidateQueries({ queryKey: ['challenge'] });
      qc.invalidateQueries({ queryKey: ['participants'] });
    },
    onError: (e) => {
      setPaymentError(e instanceof Error ? e.message : 'No se pudo subir el comprobante');
    },
  });
  const countdown = useCountdown(challenge?.endDate);

  if (!challenge) {
    return (
      <div className="card p-8 text-center">
        <h2 className="display text-3xl mb-2">Sin reto activo</h2>
        <p className="text-ink-dim">
          {user?.role === 'ADMIN'
            ? 'Crea uno desde la sección Retos.'
            : 'Pídele al admin que active un reto.'}
        </p>
      </div>
    );
  }

  const today = isoToday();
  const todayActivity = activities?.find((a) => toDayKey(a.date) === today);
  const validatedCount = activities?.filter((a) => a.status === 'VALIDATED').length ?? 0;
  const pendingCount = activities?.filter((a) => a.status === 'PENDING').length ?? 0;
  const myRank = results?.ranking.find((r) => r.userId === user?.id);
  const myParticipation = challenge.me;
  const isFreeChallenge = parseFloat(challenge.feePerParticipant) <= 0;

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <p className="text-accent text-xs uppercase tracking-[0.2em] font-semibold mb-2">
            {challenge.name}
          </p>
          <h1 className="display text-5xl md:text-6xl leading-none">
            ¡Hola, {user?.name.split(' ')[0]}!
          </h1>
          <p className="text-ink-dim mt-3 max-w-md">
            {formatDate(challenge.startDate)} → {formatDate(challenge.endDate)} ·
            Días válidos: {challenge.validDays.map((d) => DAY_NAMES[d]).join(', ')}
          </p>
        </div>
        <div className="card px-5 py-3">
          <p className="text-xs uppercase tracking-wider text-ink-mute">
            Finaliza en
          </p>
          <p className="display text-3xl text-accent">{countdown}</p>
        </div>
        <TodayCard calendar={calendar} today={today} fallbackActivity={todayActivity} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Validados" value={validatedCount} accent />
        <Stat label="Pendientes" value={pendingCount} />
        <Stat
          label="Posición"
          value={
            myRank
              ? `${results!.ranking.findIndex((r) => r.userId === user?.id) + 1}°`
              : '—'
          }
        />
        <Stat
          label="Top del reto"
          value={results?.topScore ?? 0}
          suffix={
            challenge.pointsPerValidatedDay !== 1 || parseFloat(challenge.pointsPerKm) > 0
              ? ' pts'
              : ' días'
          }
        />
      </div>

      {user?.role === 'PARTICIPANT' && myParticipation && (
        <section className="card p-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className="display text-2xl tracking-wider">
                Comprobante de pago
              </h2>
              {isFreeChallenge ? (
                <p className="text-sm text-ink-dim mt-1">Este reto no tiene cuota</p>
              ) : (
                <>
                  <p className="text-sm text-ink-dim mt-1">
                    Cuota: {challenge.feePerParticipant} {challenge.currency} · Estado:{' '}
                    {paymentLabel(myParticipation, challenge.feePerParticipant, challenge.currency)}
                  </p>
                  {myParticipation.paymentStatus === 'pending' && (
                    <p className="text-sm text-ink-dim mt-1">
                      Sube tu comprobante para que el administrador lo revise
                    </p>
                  )}
                </>
              )}
              {myParticipation.paymentProofUrl && (
                <a
                  href={myParticipation.paymentProofUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent text-sm inline-block mt-2 hover:underline"
                >
                  Ver comprobante cargado
                </a>
              )}
              {paymentError && (
                <p className="text-bad text-sm mt-2">{paymentError}</p>
              )}
            </div>
            {!isFreeChallenge && (
            <div>
              <input
                ref={paymentInputRef}
                type="file"
                accept={ACCEPT['payment-proof']}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadPaymentMut.mutate(file);
                  e.currentTarget.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => paymentInputRef.current?.click()}
                disabled={uploadPaymentMut.isPending}
                className="btn-primary"
              >
                {uploadPaymentMut.isPending
                  ? 'Subiendo…'
                  : myParticipation.paymentProofUrl
                    ? 'Reemplazar comprobante'
                    : 'Subir comprobante'}
              </button>
            </div>
            )}
          </div>
        </section>
      )}

      {calendar && <MyMonth calendar={calendar} challengeName={challenge.name} today={today} />}

      {/* Mis actividades */}
      <section>
        <h2 className="display text-2xl mb-4 tracking-wider">Mis actividades</h2>
        {withdrawError && (
          <div role="alert" className="text-bad text-sm bg-bad/10 border border-bad/30 rounded-md px-4 py-2.5 mb-3">
            {withdrawError}
          </div>
        )}
        {withdrawnDate && (
          <div role="status" className="text-sm bg-ok/10 border border-ok/30 rounded-md px-4 py-2.5 mb-3 flex flex-wrap items-center gap-3">
            <span>Actividad retirada.</span>
            {challenge.status === 'ACTIVE' && canRegisterAgain(calendar, withdrawnDate) && (
              <Link href={`/dashboard/upload?date=${withdrawnDate}`} className="underline font-medium">
                Registrar ese día
              </Link>
            )}
          </div>
        )}
        {activities && activities.length > 0 ? (
          <div className="card divide-y divide-line" aria-label="Mis actividades">
            {activities.map((a) => (
              <ActivityRow
                key={a.id}
                activity={a}
                withdrawing={withdrawMut.isPending && withdrawMut.variables?.id === a.id}
                onWithdraw={() => withdrawMut.mutate({ id: a.id, date: a.date, rejected: a.status === 'REJECTED' })}
              />
            ))}
          </div>
        ) : (
          <div className="card p-8 text-center text-ink-dim">
            Aún no has registrado ninguna actividad.
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * Tarjeta "Hoy" (spec participant-calendar). Con el calendario propio guía según el día; mientras
 * carga, si falla o si el usuario no participa, conserva el comportamiento anterior.
 */
function TodayCard({
  calendar,
  today,
  fallbackActivity,
}: {
  calendar: MyCalendar | undefined;
  today: string;
  fallbackActivity: DailyActivity | undefined;
}) {
  const duty = calendar ? todayDuty(calendar, today) : null;

  if (!duty) {
    return fallbackActivity ? (
      <RegisteredToday status={fallbackActivity.status} />
    ) : (
      <Link href="/dashboard/upload" className="btn-primary">
        Subir actividad de hoy
      </Link>
    );
  }

  switch (duty.kind) {
    case 'REGISTERED':
      return <RegisteredToday status={duty.activity.status} />;
    case 'OPEN':
      return (
        <div className="card px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-3" role="status">
          <p className="text-sm font-medium">Hoy es día válido y aún no registraste tu actividad</p>
          <Link href={`/dashboard/upload?date=${today}`} className="btn-primary">
            Registrar hoy
          </Link>
        </div>
      );
    case 'REST':
      return (
        <div className="card px-5 py-3" role="status">
          <p className="text-sm font-medium">Hoy es día de descanso</p>
        </div>
      );
    case 'BEFORE':
      return (
        <div className="card px-5 py-3" role="status">
          <p className="text-sm font-medium">
            El reto empieza el {formatDay(duty.startDate, { day: 'numeric', month: 'long' })}
          </p>
        </div>
      );
    case 'AFTER':
      return (
        <div className="card px-5 py-3" role="status">
          <p className="text-sm font-medium">El período del reto terminó</p>
        </div>
      );
  }
}

function RegisteredToday({ status }: { status: DailyActivity['status'] }) {
  return (
    <div className="card px-5 py-3 flex items-center gap-3">
      <span className="display text-2xl text-accent">✓</span>
      <div>
        <p className="text-sm font-medium">Hoy ya está</p>
        <StatusBadge status={status} />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  suffix,
  accent,
}: {
  label: string;
  value: number | string;
  suffix?: string;
  accent?: boolean;
}) {
  return (
    <div className="card p-5">
      <p className="text-xs uppercase tracking-wider text-ink-dim mb-1">{label}</p>
      <p
        className={`display text-4xl ${accent ? 'text-accent' : 'text-ink'}`}
      >
        {value}
        {suffix && <span className="text-base text-ink-dim ml-1">{suffix}</span>}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: DailyActivity['status'] }) {
  if (status === 'VALIDATED') return <span className="badge-validated">Validado</span>;
  if (status === 'REJECTED') return <span className="badge-rejected">Rechazado</span>;
  return <span className="badge-pending">Pendiente</span>;
}

function ActivityRow({
  activity,
  onWithdraw,
  withdrawing,
}: {
  activity: DailyActivity;
  onWithdraw: () => void;
  withdrawing: boolean;
}) {
  // Confirmación en la misma fila: el retiro borra la actividad y no se puede deshacer
  const [confirming, setConfirming] = useState(false);
  const rejected = activity.status === 'REJECTED';
  const withdrawable = activity.status === 'PENDING' || rejected;
  return (
    <div id={`actividad-${activity.id}`} className="p-4 flex flex-wrap items-center gap-4 scroll-mt-20">
      <div className="display text-2xl text-ink-dim w-16 text-center">
        {formatDate(activity.date)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium">
          {activity.exerciseType.toLowerCase()} · {activity.durationMinutes} min
          {activity.distanceKm && ` · ${activity.distanceKm} km`}
        </p>
        {activity.rejectionReason && (
          <p className="text-sm text-bad mt-1">⚠ {activity.rejectionReason}</p>
        )}
        {rejected && (
          <p className="text-sm text-ink-dim mt-1">Puedes retirarla y registrar ese día de nuevo.</p>
        )}
      </div>
      <StatusBadge status={activity.status} />
      {withdrawable &&
        (confirming ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-ink-dim">
              {rejected
                ? '¿Retirar esta actividad rechazada? Se borrará con sus fotos y podrás registrar ese día de nuevo.'
                : '¿Retirar esta actividad?'}
            </span>
            <button
              type="button"
              onClick={onWithdraw}
              disabled={withdrawing}
              className="btn-danger text-sm py-1 px-3"
            >
              {withdrawing ? 'Retirando…' : 'Sí, retirar'}
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="btn-ghost text-sm py-1 px-3">
              No
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className="btn-ghost text-sm py-1 px-3">
            Retirar
          </button>
        ))}
    </div>
  );
}
