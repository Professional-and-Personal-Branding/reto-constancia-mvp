'use client';

import { Suspense, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import type { DailyActivity } from '@/lib/types';
import { formatDay } from '@/lib/dates';
import { useActiveChallenge } from '@/lib/use-active-challenge';
import { earlierRejections, resubmittedLabel } from '@/lib/resubmission';

function formatDate(iso: string): string {
  return formatDay(iso, { day: '2-digit', month: 'short', year: 'numeric' });
}

// useSearchParams necesita un límite de Suspense para que la página siga siendo estática
export default function ValidationsPage() {
  return (
    <Suspense fallback={<p className="text-ink-dim">Cargando…</p>}>
      <Validations />
    </Suspense>
  );
}

function Validations() {
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { challenges, isLoading: challengesLoading } = useActiveChallenge();

  // El reto y el orden viven en la URL (?reto=<id>&orden=desc) para sobrevivir a una recarga.
  // Un reto que no está entre los activos se ignora y se muestran todos.
  const requestedId = params.get('reto');
  const challengeId = requestedId && challenges.some((c) => c.id === requestedId) ? requestedId : undefined;
  const order: 'asc' | 'desc' = params.get('orden') === 'desc' ? 'desc' : 'asc';

  function setFilter(next: { reto?: string; orden?: 'asc' | 'desc' }) {
    const q = new URLSearchParams(params.toString());
    const reto = 'reto' in next ? next.reto : (challengeId ?? requestedId ?? undefined);
    const orden = next.orden ?? order;
    if (reto) q.set('reto', reto);
    else q.delete('reto');
    if (orden === 'desc') q.set('orden', 'desc');
    else q.delete('orden');
    const qs = q.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  const { data: pending, isLoading } = useQuery<DailyActivity[]>({
    queryKey: ['activities', 'pending', challengeId ?? 'all', order],
    queryFn: () => {
      const q = new URLSearchParams({ order });
      if (challengeId) q.set('challengeId', challengeId);
      return api<DailyActivity[]>(`/activities/pending?${q.toString()}`);
    },
    // Espera a conocer los retos activos para no pedir la lista de "todos" y luego la filtrada
    enabled: !challengesLoading,
  });

  const [actionError, setActionError] = useState<string | null>(null);

  function showError(e: unknown) {
    const apiErr = e as ApiError;
    const msg =
      (apiErr?.body as { message?: string | string[] } | null)?.message ??
      (e instanceof Error ? e.message : 'Error inesperado');
    setActionError(Array.isArray(msg) ? msg.join(', ') : msg);
  }

  const validateMut = useMutation({
    // `note` solo se envía cuando la actividad no cumple la regla de FC (override explícito)
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      api(`/activities/${id}/validate`, {
        method: 'POST',
        body: note ? { override: true, note } : undefined,
      }),
    onSuccess: () => {
      setActionError(null);
      qc.invalidateQueries({ queryKey: ['activities'] });
      qc.invalidateQueries({ queryKey: ['results'] });
    },
    onError: showError,
  });

  const rejectMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api(`/activities/${id}/reject`, { method: 'POST', body: { reason } }),
    onSuccess: () => {
      setActionError(null);
      qc.invalidateQueries({ queryKey: ['activities'] });
      qc.invalidateQueries({ queryKey: ['results'] });
    },
    onError: showError,
  });

  return (
    <div className="space-y-8">
      <div>
        <p className="text-accent text-xs uppercase tracking-[0.2em] font-semibold mb-2">
          VAR deportivo
        </p>
        <h1 className="display text-5xl leading-none">Validaciones</h1>
        <p className="text-ink-dim mt-3">
          {pending?.length ?? 0} actividad{pending?.length === 1 ? '' : 'es'} pendiente
          {pending?.length === 1 ? '' : 's'} de revisión.
        </p>
        <div className="flex flex-wrap items-center gap-3 mt-4">
          <label className="flex items-center gap-2 text-sm text-ink-dim">
            Reto
            <select
              className="input py-1.5"
              aria-label="Filtrar por reto"
              value={challengeId ?? ''}
              onChange={(e) => setFilter({ reto: e.target.value || undefined })}
            >
              <option value="">Todos los retos</option>
              {challenges.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-dim">
            Orden
            <select
              className="input py-1.5"
              aria-label="Orden de la cola"
              value={order}
              onChange={(e) => setFilter({ orden: e.target.value === 'desc' ? 'desc' : 'asc' })}
            >
              <option value="asc">Más antiguas primero</option>
              <option value="desc">Más nuevas primero</option>
            </select>
          </label>
        </div>
      </div>

      {actionError && (
        <div
          role="alert"
          className="text-bad text-sm bg-bad/10 border border-bad/30 rounded-md px-4 py-2.5"
        >
          {actionError}
        </div>
      )}

      {isLoading && <p className="text-ink-dim">Cargando…</p>}

      {pending && pending.length === 0 && (
        <div className="card p-8 text-center text-ink-dim">
          ¡Todo al día! No hay actividades pendientes.
        </div>
      )}

      <div className="grid gap-4">
        {pending?.map((act) => (
          <ActivityCard
            key={act.id}
            activity={act}
            onValidate={(note) => validateMut.mutate({ id: act.id, note })}
            onReject={(reason) => rejectMut.mutate({ id: act.id, reason })}
            isValidating={validateMut.isPending && validateMut.variables?.id === act.id}
            isRejecting={
              rejectMut.isPending && rejectMut.variables?.id === act.id
            }
          />
        ))}
      </div>
    </div>
  );
}

function ActivityCard({
  activity,
  onValidate,
  onReject,
  isValidating,
  isRejecting,
}: {
  activity: DailyActivity;
  onValidate: (note?: string) => void;
  onReject: (reason: string) => void;
  isValidating: boolean;
  isRejecting: boolean;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [overriding, setOverriding] = useState(false);
  const [note, setNote] = useState('');
  // En un reto cerrado las actividades son definitivas: la API respondería 400 (design D4)
  const closedChallenge = activity.challenge?.status === 'COMPLETED';
  // El participante la corrigió y reenvió: se avisa y se muestran los motivos de rechazos anteriores
  const resubmittedBadge = resubmittedLabel(activity.resubmissionCount);
  const earlier = earlierRejections(activity);

  return (
    <div className="card p-5">
      <div className="flex flex-col md:flex-row gap-5">
        {/* Fotos */}
        <div className="flex gap-2 md:w-1/3">
          {activity.photos.map((p) => (
            <a
              key={p.id}
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block flex-1 group"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt={p.type}
                className="w-full h-32 object-cover rounded-md border border-line group-hover:border-accent transition"
              />
              <p className="text-xs text-ink-mute mt-1 text-center">
                {p.type === 'HEART_RATE' ? 'FC' : p.type === 'METRICS' ? 'Métricas' : 'Actividad'}
              </p>
            </a>
          ))}
        </div>

        {/* Info */}
        <div className="flex-1 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="display text-2xl">{activity.user?.name}</p>
              <p className="text-xs text-ink-mute">{activity.user?.email}</p>
              {activity.challenge?.name && (
                <p className="text-xs text-ink-dim mt-1">Reto: {activity.challenge.name}</p>
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {activity.heartRateCompliant ? (
                <span className="badge bg-ok/15 text-ok">Cumple FC</span>
              ) : (
                <span className="badge bg-warn/15 text-warn">No cumple FC</span>
              )}
              {closedChallenge && <span className="badge bg-ink-mute/15 text-ink-dim">Reto cerrado</span>}
              {resubmittedBadge && <span className="badge bg-accent/15 text-accent">{resubmittedBadge}</span>}
              <span className="badge-pending">Pendiente</span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Field label="Fecha" value={formatDate(activity.date)} />
            <Field label="Tipo" value={activity.exerciseType.toLowerCase()} />
            <Field label="Duración" value={`${activity.durationMinutes} min`} />
            <Field
              label="Distancia"
              value={activity.distanceKm ? `${activity.distanceKm} km` : '—'}
            />
            <Field
              label="FC promedio"
              value={activity.avgHeartRate ? `${activity.avgHeartRate} bpm` : '—'}
            />
            <Field
              label="Captura FC"
              value={activity.hasHeartRateProof ? 'Sí ✓' : 'No'}
              warn={!activity.hasHeartRateProof}
            />
            <Field
              label="FC registrada"
              value={activity.heartRateMinutes ? `${activity.heartRateMinutes} min` : '—'}
              warn={!activity.heartRateCompliant}
            />
          </div>

          {earlier.length > 0 && (
            <div className="text-sm">
              <p className="text-xs uppercase tracking-wider text-ink-mute">
                Rechazos anteriores ({earlier.length})
              </p>
              <ul className="mt-1 space-y-1 text-ink-dim">
                {earlier.map((r) => (
                  <li key={r.rejectedAt}>
                    {formatDate(r.rejectedAt)} · {r.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {activity.notes && (
            <p className="text-sm text-ink-dim italic">
              &ldquo;{activity.notes}&rdquo;
            </p>
          )}

          {closedChallenge ? (
            <p className="text-sm text-ink-dim pt-2">
              El reto está cerrado; sus actividades son definitivas y ya no se validan ni se rechazan.
            </p>
          ) : overriding ? (
            <div className="space-y-2 pt-2">
              <p className="text-sm text-warn">
                Esta actividad no cumple la regla de FC del reto. Para validarla de todas formas,
                deja una nota (queda registrada).
              </p>
              <input
                type="text"
                placeholder="Motivo del override (mín. 5 caracteres)"
                className="input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                minLength={5}
                maxLength={300}
                aria-label="Nota de override"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (note.trim().length >= 5) {
                      onValidate(note.trim());
                      setOverriding(false);
                    }
                  }}
                  disabled={note.trim().length < 5 || isValidating}
                  className="btn bg-ok/15 hover:bg-ok/25 text-ok border border-ok/30"
                >
                  Validar con nota
                </button>
                <button
                  onClick={() => {
                    setOverriding(false);
                    setNote('');
                  }}
                  className="btn-ghost"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : !rejecting ? (
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => (activity.heartRateCompliant ? onValidate() : setOverriding(true))}
                disabled={isValidating}
                className="btn bg-ok/15 hover:bg-ok/25 text-ok border border-ok/30"
              >
                {isValidating ? '…' : '✓ Validar'}
              </button>
              <button
                onClick={() => setRejecting(true)}
                disabled={isRejecting}
                className="btn-danger"
              >
                ✗ Rechazar
              </button>
            </div>
          ) : (
            <div className="space-y-2 pt-2">
              <input
                type="text"
                placeholder="Razón del rechazo"
                className="input"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                minLength={3}
                required
              />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (reason.length >= 3) {
                      onReject(reason);
                      setRejecting(false);
                    }
                  }}
                  disabled={reason.length < 3 || isRejecting}
                  className="btn-danger"
                >
                  Confirmar rechazo
                </button>
                <button
                  onClick={() => {
                    setRejecting(false);
                    setReason('');
                  }}
                  className="btn-ghost"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-ink-mute">{label}</p>
      <p className={`font-medium ${warn ? 'text-warn' : 'text-ink'}`}>{value}</p>
    </div>
  );
}
