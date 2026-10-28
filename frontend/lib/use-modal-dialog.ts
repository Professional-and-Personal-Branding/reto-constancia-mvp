'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

import { nextFocusIndex } from './focus-trap';

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [href], [tabindex]:not([tabindex="-1"])';

interface Options {
  /** El diálogo está ocupado (no se puede cancelar con Escape) */
  isPending: boolean;
  onCancel: () => void;
  /** Control que recibe el foco al abrir */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Control al que vuelve el foco al desmontar (si sigue en el documento) */
  returnFocusTo?: RefObject<HTMLElement | null>;
}

/**
 * Comportamiento de modal accesible (OpenSpec: renewal-hardening, D4): portal en `body`, resto de la
 * página inerte y oculta a tecnologías de asistencia, foco atrapado con Tab, Escape que cancela salvo
 * mientras está ocupado y retorno del foco al cerrar. Sin lógica propia de ningún diálogo concreto.
 * Devuelve `container` (el nodo donde renderizar con `createPortal`) y `dialogRef` (el elemento
 * `role="dialog"` con `tabIndex={-1}`).
 */
export function useModalDialog({ isPending, onCancel, initialFocusRef, returnFocusTo }: Options) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const pendingRef = useRef(isPending);
  const cancelRef = useRef(onCancel);
  pendingRef.current = isPending;
  cancelRef.current = onCancel;

  useEffect(() => {
    setContainer(document.body);
  }, []);

  // Fondo inerte: solo lo que no lo era, y se restaura exactamente eso.
  useEffect(() => {
    if (!container) return;
    const touched: { el: Element; ariaHidden: string | null }[] = [];
    for (const el of Array.from(document.body.children)) {
      if (el.contains(dialogRef.current) || el.hasAttribute('inert')) continue;
      touched.push({ el, ariaHidden: el.getAttribute('aria-hidden') });
      el.setAttribute('inert', '');
      el.setAttribute('aria-hidden', 'true');
    }
    return () => {
      for (const { el, ariaHidden } of touched) {
        el.removeAttribute('inert');
        if (ariaHidden === null) el.removeAttribute('aria-hidden');
        else el.setAttribute('aria-hidden', ariaHidden);
      }
    };
  }, [container]);

  // Foco inicial y retorno
  useEffect(() => {
    if (!container) return;
    (initialFocusRef?.current ?? dialogRef.current)?.focus();
    const back = returnFocusTo?.current ?? null;
    return () => {
      if (back && document.contains(back)) back.focus();
    };
    // solo al montar el modal
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [container]);

  // Con una operación en curso el foco no debe caer a body bajo el botón que se deshabilita
  useEffect(() => {
    if (isPending) dialogRef.current?.focus();
  }, [isPending]);

  useEffect(() => {
    if (!container) return;
    const onKey = (e: KeyboardEvent) => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      if (e.key === 'Escape') {
        if (!pendingRef.current) cancelRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      e.preventDefault();
      const next = nextFocusIndex(items.indexOf(document.activeElement as HTMLElement), items.length, e.shiftKey);
      (next < 0 ? dialog : items[next]).focus();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [container]);

  return { container, dialogRef };
}
