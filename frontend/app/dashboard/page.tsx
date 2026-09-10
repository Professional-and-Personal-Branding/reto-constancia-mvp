'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useActiveChallenge } from '@/lib/use-active-challenge';
import { formatDay, isoToday, toDayKey } from '@/lib/dates';
import { uploadToCloudinary } from '@/lib/cloudinary';
import type {
  ChallengeParticipant,
  DailyActivity,
  ChallengeResults,
} from '@/lib/types';

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

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

  const remainingMs = new Date(endDate).getTime() - now;
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

  const { data: results } = useQuery<ChallengeResults>({
    queryKey: ['results', challenge?.id],
    queryFn: () => api<ChallengeResults>(`/challenges/${challenge!.id}/results`),
    enabled: !!challenge,
  });

  const uploadPaymentMut = useMutation({
    mutationFn: async (file: File) => {
      if (!challenge) throw new Error('Sin reto activo');
      const folder = `payments/${challenge.year}-${String(challenge.month).padStart(2, '0')}`;
      const proof = await uploadToCloudinary(file, folder, 'auto');

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
  const myParticipation = challenge.participants?.find((p) => p.userId === user?.id);

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
        {!todayActivity && (
          <Link href="/dashboard/upload" className="btn-primary">
            Subir actividad de hoy
          </Link>
        )}
        {todayActivity && (
          <div className="card px-5 py-3 flex items-center gap-3">
            <span className="display text-2xl text-accent">✓</span>
            <div>
              <p className="text-sm font-medium">Hoy ya está</p>
              <StatusBadge status={todayActivity.status} />
            </div>
          </div>
        )}
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
          suffix=" días"
        />
      </div>

      {user?.role === 'PARTICIPANT' && myParticipation && (
        <section className="card p-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className="display text-2xl tracking-wider">
                Comprobante de pago
              </h2>
              <p className="text-sm text-ink-dim mt-1">
                Cuota: {challenge.feePerParticipant} {challenge.currency} · Estado:{' '}
                {myParticipation.paid ? 'pagado' : 'pendiente de validación'}
              </p>
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
            <div>
              <input
                ref={paymentInputRef}
                type="file"
                accept="image/*,application/pdf"
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
          </div>
        </section>
      )}

      {/* Mis actividades */}
      <section>
        <h2 className="display text-2xl mb-4 tracking-wider">Mis actividades</h2>
        {activities && activities.length > 0 ? (
          <div className="card divide-y divide-line">
            {activities.map((a) => (
              <ActivityRow key={a.id} activity={a} />
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

function ActivityRow({ activity }: { activity: DailyActivity }) {
  return (
    <div className="p-4 flex items-center gap-4">
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
      </div>
      <StatusBadge status={activity.status} />
    </div>
  );
}
