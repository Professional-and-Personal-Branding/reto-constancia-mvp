'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';

import { api } from '@/lib/api';
import { monthLabel, rulesSummary } from '@/lib/renewal';
import type { ChallengeStatus, RenewalPreview } from '@/lib/types';
import { closeErrorFrom, type CloseError } from '@/components/close-challenge-dialog';

const STATUS_LABEL: Record<ChallengeStatus, string> = {
  DRAFT: 'borrador',
  ACTIVE: 'activo',
  COMPLETED: 'cerrado',
};

interface Props {
  sourceId: string;
  open: boolean;
  isPending: boolean;
  /** Error de la API al confirmar (409, 400): se muestra dentro del diálogo */
  error: CloseError | null;
  onConfirm: (input: { name: string; copyParticipants: boolean }) => void;
  onCancel: () => void;
}

/**
 * Renovación mensual de un reto (spec challenge-renewal): muestra el mes y el período que
 * calcula el servidor, las reglas que se copian, a quién se inscribiría y lo que no se copia.
 * Con el mes siguiente ya ocupado, la confirmación queda deshabilitada.
 */
export function RenewChallengeDialog({ sourceId, open, isPending, error, onConfirm, onCancel }: Props) {
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [name, setName] = useState('');
  const [copyParticipants, setCopyParticipants] = useState(true);

  const {
    data: preview,
    isLoading,
    error: previewError,
  } = useQuery<RenewalPreview>({
    queryKey: ['renewal-preview', sourceId],
    queryFn: () => api<RenewalPreview>(`/challenges/${sourceId}/renewal-preview`),
    enabled: open,
    staleTime: 0,
  });

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isPending) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // isPending y onCancel no deben reiniciar el foco mientras el diálogo está abierto
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const suggested = preview?.target.name;
  useEffect(() => {
    if (suggested) setName(suggested);
  }, [suggested]);

  if (!open) return null;

  const previewMessage = previewError ? closeErrorFrom(previewError).message : null;
  const taken = preview?.existing ?? null;
  const toCopy = preview?.participants.toCopy ?? [];
  const skipped = preview?.participants.skipped ?? [];
  const canConfirm = !!preview && !taken && !isPending && name.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="card w-full max-w-xl max-h-full overflow-y-auto p-6 space-y-5"
      >
        <div>
          <p className="text-accent text-xs uppercase tracking-[0.2em] font-semibold mb-1">Renovar reto</p>
          <h2 id={titleId} className="display text-2xl tracking-wider">
            {preview ? `Renovar ${preview.source.name}` : 'Renovar reto'}
          </h2>
        </div>

        {isLoading && <p className="text-ink-dim">Cargando la vista previa…</p>}
        {previewMessage && (
          <p role="alert" className="text-bad text-sm">
            {previewMessage}
          </p>
        )}

        {preview && (
          <>
            <section aria-label="Mes nuevo" className="space-y-1">
              <p className="text-sm">
                Se creará <strong>{preview.target.name}</strong> en borrador.
              </p>
              <p className="text-sm text-ink-dim">
                {monthLabel(preview.target.month, preview.target.year)} · del {preview.target.startDate} al{' '}
                {preview.target.endDate}
              </p>
              {taken && (
                <p role="alert" className="text-sm text-warn">
                  Ya existe un reto para {monthLabel(preview.target.month, preview.target.year)} (
                  {STATUS_LABEL[taken.status]})
                </p>
              )}
            </section>

            <section aria-label="Reglas que se copian" className="space-y-1">
              <h3 className="label">Reglas que se copian</h3>
              <p className="text-sm text-ink-dim">{rulesSummary(preview.rules)}</p>
            </section>

            <div>
              <label htmlFor={`${titleId}-name`} className="label">
                Nombre del reto nuevo
              </label>
              <input
                id={`${titleId}-name`}
                className="input mt-1"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isPending}
              />
            </div>

            <section aria-label="Participantes" className="space-y-2">
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1 accent-accent"
                  checked={copyParticipants}
                  onChange={(e) => setCopyParticipants(e.target.checked)}
                  disabled={isPending}
                />
                <span>
                  Inscribir a los {toCopy.length} participantes activos de {preview.source.name}
                </span>
              </label>
              {toCopy.length > 0 && (
                <details className="text-sm text-ink-dim">
                  <summary className="cursor-pointer">Ver quiénes se inscriben</summary>
                  <ul className="mt-1 space-y-0.5">
                    {toCopy.map((p) => (
                      <li key={p.userId}>{p.name}</li>
                    ))}
                  </ul>
                </details>
              )}
              {skipped.length > 0 && (
                <ul className="text-sm text-ink-dim space-y-0.5">
                  {skipped.map((p) => (
                    <li key={p.userId}>{p.name} · no se copian: usuario inactivo</li>
                  ))}
                </ul>
              )}
            </section>

            <p className="text-sm text-ink-dim">
              No se copian pagos, comprobantes, actividades ni premiaciones. El reto nace en borrador: revísalo y
              actívalo cuando corresponda.
            </p>
          </>
        )}

        {error && (
          <div role="alert" className="text-bad text-sm bg-bad/10 border border-bad/30 rounded-md px-4 py-2.5">
            {error.message}
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
          <button ref={cancelRef} type="button" className="btn-ghost" onClick={onCancel} disabled={isPending}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => onConfirm({ name: name.trim(), copyParticipants })}
            disabled={!canConfirm}
          >
            {isPending ? 'Creando…' : 'Crear borrador'}
          </button>
        </div>
      </div>
    </div>
  );
}
