'use client';

import { useId, useRef, type RefObject } from 'react';
import { createPortal } from 'react-dom';

import type { BulkPaymentSummary } from '@/lib/payment';
import { useModalDialog } from '@/lib/use-modal-dialog';

interface Props {
  open: boolean;
  summary: BulkPaymentSummary;
  isPending: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  returnFocusTo?: RefObject<HTMLElement | null>;
}

/**
 * Confirmación de "Marcar seleccionados como pagados" (spec challenge-finance, pagos en lote):
 * dice a cuántas personas y cuánto se registrará, y lista aparte a quienes el lote no toca.
 */
export function BulkPaymentDialog({ open, summary, isPending, error, onConfirm, onCancel, returnFocusTo }: Props) {
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const { container, dialogRef } = useModalDialog({
    isPending,
    onCancel,
    initialFocusRef: cancelRef,
    returnFocusTo,
  });

  if (!open || !container) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="card w-full max-w-lg max-h-full overflow-y-auto p-6 space-y-4 outline-none"
      >
        <h2 id={titleId} className="display text-2xl tracking-wider">
          Marcar como pagados
        </h2>
        <p className="text-sm">{summary.headline}</p>
        {summary.untouched.length > 0 && (
          <div className="text-sm">
            <p className="font-medium mb-1">No se tocan:</p>
            <ul className="list-disc pl-5 text-ink-dim space-y-0.5">
              {summary.untouched.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-bad">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <button type="button" ref={cancelRef} onClick={onCancel} disabled={isPending} className="btn-ghost">
            Cancelar
          </button>
          <button type="button" onClick={onConfirm} disabled={isPending || summary.count === 0} className="btn-primary">
            Confirmar
          </button>
        </div>
      </div>
    </div>,
    container,
  );
}
