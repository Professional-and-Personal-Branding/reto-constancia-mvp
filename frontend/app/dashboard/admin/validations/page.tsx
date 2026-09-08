'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import type { DailyActivity } from '@/lib/types';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-BO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function ValidationsPage() {
  const qc = useQueryClient();

  const { data: pending, isLoading } = useQuery<DailyActivity[]>({
    queryKey: ['activities', 'pending'],
    queryFn: () => api<DailyActivity[]>('/activities/pending'),
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
            </div>
            <div className="flex gap-2">
              {activity.heartRateCompliant ? (
                <span className="badge bg-ok/15 text-ok">Cumple FC</span>
              ) : (
                <span className="badge bg-warn/15 text-warn">No cumple FC</span>
              )}
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

          {activity.notes && (
            <p className="text-sm text-ink-dim italic">
              &ldquo;{activity.notes}&rdquo;
            </p>
          )}

          {overriding ? (
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
