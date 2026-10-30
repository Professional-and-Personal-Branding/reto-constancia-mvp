'use client';

import { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useModalDialog } from '@/lib/use-modal-dialog';
import { INACTIVE_NOTICE, TEMP_PASSWORD_NOTICE } from '@/lib/users';

interface ConfirmProps {
  title: string;
  message: string;
  confirmLabel: string;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmación de una acción sobre otro usuario (spec user-administration). */
export function UserConfirmDialog({ title, message, confirmLabel, isPending, onConfirm, onCancel }: ConfirmProps) {
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const { container, dialogRef } = useModalDialog({ isPending, onCancel, initialFocusRef: cancelRef });
  if (!container) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="card w-full max-w-md max-h-full overflow-y-auto p-6 space-y-4 outline-none"
      >
        <h2 id={titleId} className="display text-2xl tracking-wider">
          {title}
        </h2>
        <p className="text-sm">{message}</p>
        <div className="flex justify-end gap-3">
          <button type="button" ref={cancelRef} onClick={onCancel} disabled={isPending} className="btn-ghost">
            Cancelar
          </button>
          <button type="button" onClick={onConfirm} disabled={isPending} className="btn-primary">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    container,
  );
}

interface ResultProps {
  name: string;
  active: boolean;
  temporaryPassword: string;
  onClose: () => void;
}

/** Contraseña temporal: se muestra una sola vez y desaparece al cerrar. */
export function TemporaryPasswordDialog({ name, active, temporaryPassword, onClose }: ResultProps) {
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const { container, dialogRef } = useModalDialog({ isPending: false, onCancel: onClose, initialFocusRef: inputRef });
  if (!container) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      setCopyMessage('Copiada');
    } catch {
      inputRef.current?.select();
      setCopyMessage('No se pudo copiar: el texto quedó seleccionado, cópialo con Ctrl+C.');
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="card w-full max-w-md max-h-full overflow-y-auto p-6 space-y-4 outline-none"
      >
        <h2 id={titleId} className="display text-2xl tracking-wider">
          Contraseña temporal de {name}
        </h2>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            readOnly
            aria-label="Contraseña temporal"
            data-testid="temporary-password"
            value={temporaryPassword}
            onFocus={(e) => e.currentTarget.select()}
            className="input font-mono"
          />
          <button type="button" onClick={copy} className="btn-ghost">
            Copiar
          </button>
        </div>
        {copyMessage && (
          <p role="status" className="text-sm text-ink-dim">
            {copyMessage}
          </p>
        )}
        <p className="text-sm">{TEMP_PASSWORD_NOTICE}</p>
        {!active && <p className="text-sm text-ink-dim">{INACTIVE_NOTICE}</p>}
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="btn-primary">
            Cerrar
          </button>
        </div>
      </div>
    </div>,
    container,
  );
}
