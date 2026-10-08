'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';

import { api, ApiError } from '@/lib/api';
import { formatDay } from '@/lib/dates';
import type { ClosePreview } from '@/lib/types';

/** Error de cierre o premiación tal como lo devuelve la API. */
export interface CloseError {
  message: string;
  status?: number;
}

export function closeErrorFrom(e: unknown): CloseError {
  const apiErr = e as ApiError;
  const msg = (apiErr?.body as { message?: string | string[] } | null)?.message;
  const message = Array.isArray(msg) ? msg.join(', ') : msg ?? (e instanceof Error ? e.message : 'Error inesperado');
  return { message, status: apiErr instanceof ApiError ? apiErr.status : undefined };
}

interface Props {
  challengeId: string;
  open: boolean;
  /** close: "Cerrar reto"; award: "Guardar premiación" con los ganadores elegidos */
  mode: 'close' | 'award';
  selectedWinners?: { userId: string; name: string }[];
  isPending: boolean;
  error: CloseError | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Revisión antes de cerrar un reto (spec challenge-lifecycle, cambio assisted-challenge-close).
 * Muestra lo que el cierre deja fijo: pendientes que no contarán, comprobantes sin pago
 * registrado, impagos y la proyección de ganadores y reparto. Las pendientes exigen confirmar.
 */
export function CloseChallengeDialog({
  challengeId,
  open,
  mode,
  selectedWinners = [],
  isPending,
  error,
  onConfirm,
  onCancel,
}: Props) {
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  const { data: preview, isLoading, error: previewError } = useQuery<ClosePreview>({
    queryKey: ['close-preview', challengeId],
    queryFn: () => api<ClosePreview>(`/challenges/${challengeId}/close-preview`),
    enabled: open,
    staleTime: 0,
  });

  useEffect(() => {
    if (!open) return;
    setAcknowledged(false);
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isPending) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // isPending y onCancel no deben reiniciar la casilla mientras el diálogo está abierto
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const pending = preview?.pendingActivities.count ?? 0;
  const money = (n: number) => `${n} ${preview?.currency ?? ''}`.trim();
  const canConfirm = !!preview && !isPending && (pending === 0 || acknowledged);
  const previewMessage = previewError ? closeErrorFrom(previewError).message : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="card w-full max-w-xl max-h-full overflow-y-auto p-6 space-y-5"
      >
        <div>
          <p className="text-accent text-xs uppercase tracking-[0.2em] font-semibold mb-1">
            {mode === 'award' ? 'Guardar premiación' : 'Cerrar reto'}
          </p>
          <h2 id={titleId} className="display text-2xl tracking-wider">
            {preview?.challengeName ?? 'Revisión antes de cerrar'}
          </h2>
          <p className="text-sm text-ink-dim mt-1">
            Al cerrar, el reto queda definitivo: sus actividades ya no se validan ni se borran y no
            se registran más pagos.
          </p>
        </div>

        {isLoading && <p className="text-ink-dim">Cargando el resumen…</p>}
        {previewMessage && (
          <p role="alert" className="text-bad text-sm">
            {previewMessage}
          </p>
        )}

        {preview && (
          <>
            <section aria-label="Actividades pendientes" className="space-y-2">
              <h3 className="label">Actividades pendientes</h3>
              {pending === 0 ? (
                <p className="text-sm text-ok">No hay actividades pendientes.</p>
              ) : (
                <>
                  <p className="text-sm text-warn">
                    {pending === 1
                      ? '1 actividad pendiente no contará para el puntaje.'
                      : `${pending} actividades pendientes no contarán para el puntaje.`}{' '}
                    <Link href="/dashboard/admin/validations" className="text-accent hover:underline">
                      Ir a validar
                    </Link>
                  </p>
                  <ul className="text-sm text-ink-dim space-y-0.5">
                    {preview.pendingActivities.items.map((a) => (
                      <li key={a.id}>
                        {a.userName} · {formatDay(a.date)}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>

            {preview.proofsToReview.length > 0 && (
              <section aria-label="Comprobantes por revisar" className="space-y-2">
                <h3 className="label">Comprobantes por revisar</h3>
                <p className="text-sm text-warn">
                  Subieron comprobante y su pago no está registrado. Después del cierre ya no se
                  podrán registrar pagos.
                </p>
                <ul className="text-sm text-ink-dim space-y-0.5">
                  {preview.proofsToReview.map((p) => (
                    <li key={p.userId}>{p.name}</li>
                  ))}
                </ul>
              </section>
            )}

            {preview.unpaid.length > 0 && (
              <section aria-label="Pagos pendientes" className="space-y-2">
                <h3 className="label">Sin pago completo</h3>
                <p className="text-sm text-ink-dim">Pueden ganar igual; el pote es lo recaudado.</p>
                <ul className="text-sm text-ink-dim space-y-0.5">
                  {preview.unpaid.map((p) => (
                    <li key={p.userId}>
                      {p.name} ·{' '}
                      {p.state === 'partial'
                        ? `pagó ${money(p.amountPaid)} de ${money(preview.feePerParticipant)}`
                        : 'sin pago'}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section aria-label="Proyección del resultado" className="space-y-2">
              <h3 className="label">Proyección: al cerrar se vuelve a calcular</h3>
              {mode === 'award' ? (
                <p className="text-sm">
                  Se premiará a {selectedWinners.map((w) => w.name).join(', ') || 'nadie'}.
                </p>
              ) : preview.drawNeeded ? (
                <p className="text-sm">
                  {preview.guaranteedWinners.length > 0 &&
                    `Ganan ${preview.guaranteedWinners.map((w) => w.name).join(', ')}. `}
                  Se {preview.drawSeats === 1 ? 'sorteará 1 cupo' : `sortearán ${preview.drawSeats} cupos`} entre{' '}
                  {preview.drawCandidates.length} personas al cerrar:{' '}
                  {preview.drawCandidates.map((w) => w.name).join(', ')}. El sorteo queda guardado.
                </p>
              ) : preview.guaranteedWinners.length > 0 ? (
                <p className="text-sm">Ganan {preview.guaranteedWinners.map((w) => w.name).join(', ')}.</p>
              ) : (
                <p className="text-sm text-ink-dim">Aún no hay quien califique para ganar.</p>
              )}
              {mode === 'close' && preview.payout.monetary && preview.payout.winnersCount > 0 && (
                <p className="text-sm text-ink-dim">
                  Reparto proyectado: {money(preview.payout.perWinner)} por ganador · pote{' '}
                  {money(preview.payout.pot)} recaudado.
                </p>
              )}
            </section>

            {pending > 0 && (
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1 accent-accent"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                />
                <span>Cerrar de todas formas: las actividades pendientes no contarán</span>
              </label>
            )}
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
          <button type="button" className="btn-danger" onClick={onConfirm} disabled={!canConfirm}>
            {isPending
              ? 'Cerrando…'
              : error?.status === 409
                ? 'Reintentar'
                : mode === 'award'
                  ? 'Guardar premiación y cerrar'
                  : 'Cerrar reto'}
          </button>
        </div>
      </div>
    </div>
  );
}
