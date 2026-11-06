'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useActiveChallenge } from '@/lib/use-active-challenge';
import { BulkPaymentDialog } from '@/components/bulk-payment-dialog';
import {
  amountOwed,
  applyParticipantFilter,
  bulkPaymentMessage,
  bulkPaymentSummary,
  filterCounts,
  formatUploadDate,
  mergeBulkPayments,
  PARTICIPANT_FILTERS,
  pendingPaymentsText,
  type ParticipantFilter,
} from '@/lib/payment';
import { BULK_BATCH_SIZE, bulkSummary, chunk, mergeBulkResults } from '@/lib/renewal';
import type {
  BulkEnrollResult,
  BulkPaymentResult,
  ChallengeFinance,
  ChallengeParticipant,
  PaymentState,
  SafeUser,
} from '@/lib/types';

export default function ParticipantsPage() {
  const qc = useQueryClient();

  const { challenge } = useActiveChallenge();
  const [filter, setFilter] = useState<ParticipantFilter>('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  // Pagos en lote (spec challenge-finance): selección propia, distinta de la de inscripción
  const [paySelected, setPaySelected] = useState<string[]>([]);
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [payMessage, setPayMessage] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [copyFallback, setCopyFallback] = useState<string | null>(null);
  const fallbackRef = useRef<HTMLTextAreaElement>(null);
  const payButtonRef = useRef<HTMLButtonElement>(null);

  // La selección de pagos no sobrevive al cambio de reto ni de filtro
  const challengeId = challenge?.id;
  useEffect(() => {
    setPaySelected([]);
    setPayMessage(null);
    setCopyMessage(null);
    setCopyFallback(null);
  }, [challengeId, filter]);

  useEffect(() => {
    if (copyFallback !== null) fallbackRef.current?.select();
  }, [copyFallback]);

  const { data: participants } = useQuery<ChallengeParticipant[]>({
    queryKey: ['participants', challenge?.id],
    queryFn: () =>
      api<ChallengeParticipant[]>(`/challenges/${challenge!.id}/participants`),
    enabled: !!challenge,
  });

  const { data: allUsers } = useQuery<SafeUser[]>({
    queryKey: ['users'],
    queryFn: () => api<SafeUser[]>('/users'),
  });

  // Resumen financiero calculado por la API (spec challenge-finance)
  const { data: finance } = useQuery<ChallengeFinance>({
    queryKey: ['finance', challenge?.id],
    queryFn: () => api<ChallengeFinance>(`/challenges/${challenge!.id}/finance`),
    enabled: !!challenge,
  });

  const addMut = useMutation({
    mutationFn: (userId: string) =>
      api(`/challenges/${challenge!.id}/participants`, {
        method: 'POST',
        body: { userId },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['participants'] });
      qc.invalidateQueries({ queryKey: ['results'] });
      qc.invalidateQueries({ queryKey: ['challenge'] });
      qc.invalidateQueries({ queryKey: ['finance'] });
    },
  });

  const bulkMut = useMutation({
    // La API acepta hasta 200 ids por petición: se envía en lotes y se combina el resultado.
    mutationFn: async (userIds: string[]) => {
      const results: BulkEnrollResult[] = [];
      for (const batch of chunk(userIds, BULK_BATCH_SIZE)) {
        results.push(
          await api<BulkEnrollResult>(`/challenges/${challenge!.id}/participants/bulk`, {
            method: 'POST',
            body: { userIds: batch },
          }),
        );
      }
      return mergeBulkResults(results);
    },
    onSuccess: (result, userIds) => {
      const names = Object.fromEntries(
        (allUsers ?? []).filter((u) => userIds.includes(u.id)).map((u) => [u.id, u.name]),
      );
      setBulkMessage(bulkSummary(result, names));
      setSelected([]);
      qc.invalidateQueries({ queryKey: ['participants'] });
      qc.invalidateQueries({ queryKey: ['results'] });
      qc.invalidateQueries({ queryKey: ['challenge'] });
      qc.invalidateQueries({ queryKey: ['finance'] });
    },
  });

  const payBulkMut = useMutation({
    // La API acepta hasta 200 ids por petición: se envía en lotes y se combina el resultado.
    mutationFn: async (userIds: string[]) => {
      const results: BulkPaymentResult[] = [];
      for (const batch of chunk(userIds, BULK_BATCH_SIZE)) {
        results.push(
          await api<BulkPaymentResult>(`/challenges/${challenge!.id}/participants/payments`, {
            method: 'PATCH',
            body: { userIds: batch, paid: true },
          }),
        );
      }
      return mergeBulkPayments(results);
    },
    onSuccess: (result) => {
      setPayMessage(bulkPaymentMessage(result));
      setPaySelected([]);
      setPayDialogOpen(false);
      qc.invalidateQueries({ queryKey: ['participants'] });
      qc.invalidateQueries({ queryKey: ['finance'] });
      qc.invalidateQueries({ queryKey: ['results'] });
    },
  });

  const removeMut = useMutation({
    mutationFn: (userId: string) =>
      api(`/challenges/${challenge!.id}/participants/${userId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['participants'] });
      qc.invalidateQueries({ queryKey: ['results'] });
      qc.invalidateQueries({ queryKey: ['finance'] });
    },
  });

  const paymentMut = useMutation({
    mutationFn: ({
      userId,
      paid,
      amountPaid,
    }: {
      userId: string;
      paid: boolean;
      amountPaid?: number;
    }) =>
      api(`/challenges/${challenge!.id}/participants/${userId}/payment`, {
        method: 'PATCH',
        body: { paid, amountPaid },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['participants'] });
      qc.invalidateQueries({ queryKey: ['finance'] });
      qc.invalidateQueries({ queryKey: ['results'] });
    },
  });

  if (!challenge) {
    return <div className="card p-8 text-center text-ink-dim">Sin reto activo</div>;
  }

  const enrolledIds = new Set(participants?.map((p) => p.userId));
  const candidates = allUsers?.filter(
    (u) => !enrolledIds.has(u.id) && u.active && u.role === 'PARTICIPANT',
  );

  // Solo cuentan los marcados que siguen siendo candidatos (alguien pudo inscribirse aparte)
  const candidateIds = new Set(candidates?.map((u) => u.id));
  const selectedIds = selected.filter((id) => candidateIds.has(id));
  const allSelected = !!candidates && candidates.length > 0 && selectedIds.length === candidates.length;
  const toggle = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const fee = parseFloat(challenge.feePerParticipant);
  const financeRow = (userId: string) => finance?.participants.find((f) => f.userId === userId);
  const stateOf = (userId: string): PaymentState | undefined => financeRow(userId)?.state;
  const counts = finance ? filterCounts(finance) : undefined;
  const visible = applyParticipantFilter(participants ?? [], finance, filter);

  // Pagos en lote y lista de pendientes: solo en retos con cuota (spec challenge-finance)
  const chargesFee = !!finance && finance.feePerParticipant > 0;
  const paySelectedIds = paySelected.filter((id) => enrolledIds.has(id));
  const paySummary = finance ? bulkPaymentSummary(finance, paySelectedIds) : undefined;
  const pending = finance ? pendingPaymentsText(finance) : { count: 0, text: '' };
  const togglePay = (id: string) =>
    setPaySelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  async function copyPending() {
    setCopyFallback(null);
    try {
      await navigator.clipboard.writeText(pending.text);
      setCopyMessage(`Lista copiada (${pending.count} ${pending.count === 1 ? 'persona' : 'personas'}).`);
    } catch {
      setCopyMessage(null);
      setCopyFallback(pending.text);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-accent text-xs uppercase tracking-[0.2em] font-semibold mb-2">
          {challenge.name}
        </p>
        <h1 className="display text-5xl leading-none">Participantes</h1>
        <p className="text-ink-dim mt-3">
          {participants?.length ?? 0} inscritos · {finance?.counts.paid ?? 0} pagados ·{' '}
          {finance?.collectedTotal ?? 0} {challenge.currency} recaudados
        </p>
      </div>

      {finance && (
        <section aria-label="Resumen financiero" className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <FinanceCard
            label="Esperado"
            value={`${finance.expectedTotal} ${finance.currency}`}
            hint={`${finance.participantsTotal} × ${finance.feePerParticipant}`}
          />
          <FinanceCard
            label="Recaudado"
            value={`${finance.collectedTotal} ${finance.currency}`}
            hint={`${finance.counts.paid} pagados · ${finance.counts.partial} parciales`}
          />
          <FinanceCard
            label="Pendiente"
            value={`${finance.pendingTotal} ${finance.currency}`}
            hint={`${finance.counts.unpaid} sin pagar`}
            warn={finance.pendingTotal > 0}
          />
          <FinanceCard
            label="Presupuesto"
            value={
              finance.budgetCovered
                ? 'Cubierto'
                : `Faltan ${Math.abs(finance.budgetDelta)} ${finance.currency}`
            }
            hint={`${finance.budgetTotal} ${finance.currency} · ${
              finance.budgetMode === 'auto' ? 'automático' : 'ajustado'
            }${finance.budgetCovered && finance.budgetDelta > 0 ? ` · excedente ${finance.budgetDelta}` : ''}`}
            warn={!finance.budgetCovered}
          />
          <FinanceCard
            label="Por revisar"
            value={String(finance.proofsToReview)}
            hint="comprobantes sin pago registrado"
            warn={finance.proofsToReview > 0}
            ariaLabel={`Comprobantes por revisar: ${finance.proofsToReview}`}
            onClick={() => setFilter('review')}
          />
        </section>
      )}

      <div className="card p-5">
        <h2 className="display text-xl tracking-wider mb-4">Inscritos</h2>
        {counts && (
          <div role="group" aria-label="Filtrar inscritos" className="flex flex-wrap gap-2 mb-4">
            {PARTICIPANT_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                aria-pressed={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={`${filter === f.key ? 'btn-primary' : 'btn-ghost'} text-xs py-1.5 px-3`}
              >
                {f.label} ({counts[f.key]})
              </button>
            ))}
          </div>
        )}
        {chargesFee && finance && participants && participants.length > 0 && (
          <div className="mb-4 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setPaySelected(visible.filter((p) => stateOf(p.userId) === 'unpaid').map((p) => p.userId))
                }
                className="btn-ghost text-xs py-1.5 px-3"
              >
                Seleccionar sin pagar
              </button>
              <button
                type="button"
                ref={payButtonRef}
                onClick={() => {
                  setPayMessage(null);
                  payBulkMut.reset();
                  setPayDialogOpen(true);
                }}
                disabled={paySelectedIds.length === 0 || payBulkMut.isPending}
                className="btn-primary text-xs py-1.5 px-3"
              >
                Marcar seleccionados como pagados ({paySelectedIds.length})
              </button>
              <button
                type="button"
                onClick={copyPending}
                disabled={pending.count === 0}
                className="btn-ghost text-xs py-1.5 px-3"
              >
                {pending.count === 0 ? 'Nadie debe' : 'Copiar pendientes'}
              </button>
            </div>
            {payMessage && (
              <p role="status" className="text-sm text-ok">
                {payMessage}
              </p>
            )}
            {copyMessage && (
              <p role="status" className="text-sm text-ok">
                {copyMessage}
              </p>
            )}
            {copyFallback !== null && (
              <div>
                <textarea
                  ref={fallbackRef}
                  readOnly
                  aria-label="Lista de pendientes"
                  value={copyFallback}
                  rows={Math.min(10, copyFallback.split('\n').length)}
                  className="input w-full text-sm"
                />
                <p className="text-xs text-ink-mute">Cópiala con Ctrl+C</p>
              </div>
            )}
          </div>
        )}
        {participants && participants.length > 0 && visible.length === 0 && (
          <p className="text-ink-dim text-sm">Nadie en este filtro.</p>
        )}
        {participants && participants.length > 0 ? (
          <div className="divide-y divide-line -mx-5">
            {visible.map((p) => (
              <ParticipantRow
                key={p.id}
                participant={p}
                fee={fee}
                currency={challenge.currency}
                state={stateOf(p.userId)}
                proofToReview={financeRow(p.userId)?.proofToReview ?? false}
                payChecked={chargesFee ? paySelectedIds.includes(p.userId) : undefined}
                onTogglePay={() => togglePay(p.userId)}
                onPay={(amountPaid) => paymentMut.mutate({ userId: p.userId, paid: true, amountPaid })}
                onUnpay={() => paymentMut.mutate({ userId: p.userId, paid: false })}
                onRemove={() => {
                  if (confirm(`¿Quitar a ${p.user.name} del reto?`)) {
                    removeMut.mutate(p.userId);
                  }
                }}
                isPending={paymentMut.isPending || removeMut.isPending}
              />
            ))}
          </div>
        ) : (
          <p className="text-ink-dim text-sm">Aún sin participantes inscritos.</p>
        )}
      </div>

      {paySummary && payDialogOpen && (
        <BulkPaymentDialog
          open
          summary={paySummary}
          isPending={payBulkMut.isPending}
          error={
            payBulkMut.isError
              ? payBulkMut.error instanceof Error
                ? payBulkMut.error.message
                : 'No se pudo registrar los pagos'
              : null
          }
          onConfirm={() => payBulkMut.mutate(paySelectedIds)}
          onCancel={() => setPayDialogOpen(false)}
          returnFocusTo={payButtonRef}
        />
      )}

      <div className="card p-5">
        <h2 className="display text-xl tracking-wider mb-4">Agregar participante</h2>
        {bulkMessage && (
          <p role="status" className="text-sm text-ok mb-3">
            {bulkMessage}
          </p>
        )}
        {bulkMut.isError && (
          <p role="alert" className="text-sm text-bad mb-3">
            {bulkMut.error instanceof Error ? bulkMut.error.message : 'No se pudo inscribir'}
          </p>
        )}
        {candidates && candidates.length > 0 ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
              <label className="flex items-center gap-2 text-sm text-ink-dim">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? [] : candidates.map((u) => u.id))}
                />
                Seleccionar todos
              </label>
              <button
                type="button"
                onClick={() => {
                  setBulkMessage(null);
                  bulkMut.mutate(selectedIds);
                }}
                disabled={selectedIds.length === 0 || bulkMut.isPending}
                className="btn-primary py-1.5 px-3 text-sm"
              >
                Inscribir seleccionados ({selectedIds.length})
              </button>
            </div>
            {candidates.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between gap-3 p-3 rounded-md border border-line"
              >
                <input
                  type="checkbox"
                  aria-label={`Seleccionar a ${u.name}`}
                  checked={selectedIds.includes(u.id)}
                  onChange={() => toggle(u.id)}
                />
                <div className="flex-1">
                  <p className="font-medium">{u.name}</p>
                  <p className="text-xs text-ink-mute">{u.email}</p>
                </div>
                <button
                  onClick={() => addMut.mutate(u.id)}
                  disabled={addMut.isPending}
                  className="btn-primary py-1.5 px-3 text-sm"
                >
                  + Inscribir
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-ink-dim text-sm">
            No hay usuarios disponibles. Pídeles que se registren primero en /register.
          </p>
        )}
      </div>
    </div>
  );
}

function ParticipantRow({
  participant: p,
  fee,
  currency,
  state,
  proofToReview,
  payChecked,
  onTogglePay,
  onPay,
  onUnpay,
  onRemove,
  isPending,
}: {
  participant: ChallengeParticipant;
  fee: number;
  currency: string;
  state?: PaymentState;
  proofToReview: boolean;
  /** Casilla de pagos en lote; indefinida en un reto sin cuota (no se muestra) */
  payChecked?: boolean;
  onTogglePay: () => void;
  onPay: (amountPaid: number) => void;
  onUnpay: () => void;
  onRemove: () => void;
  isPending: boolean;
}) {
  // Registrar un pago pide el monto recibido (viene la cuota): menos que la cuota es parcial
  const [entering, setEntering] = useState(false);
  const [amount, setAmount] = useState(String(fee));
  const [amountError, setAmountError] = useState<string | null>(null);

  function savePayment() {
    const value = Number(amount);
    if (!amount.trim() || !Number.isFinite(value) || value <= 0) {
      setAmountError('Indica un monto mayor que cero');
      return;
    }
    setAmountError(null);
    setEntering(false);
    onPay(value);
  }

  return (
    <div
      className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3"
      aria-label={`Participante ${p.user.name}`}
    >
      {payChecked !== undefined && (
        <input
          type="checkbox"
          aria-label={`Seleccionar el pago de ${p.user.name}`}
          checked={payChecked}
          onChange={onTogglePay}
        />
      )}
      <div className="flex-1 min-w-0">
        <p className="font-medium">{p.user.name}</p>
        <p className="text-xs text-ink-mute">{p.user.email}</p>
        {proofToReview && (
          <p className="mt-1">
            <span className="badge bg-warn/15 text-warn">
              Comprobante por revisar
              {p.paymentProofUploadedAt && ` · subido el ${formatUploadDate(p.paymentProofUploadedAt)}`}
            </span>
          </p>
        )}
        {p.paymentProofUrl && (
          <a
            href={p.paymentProofUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-accent hover:underline"
          >
            Ver comprobante de pago
          </a>
        )}
      </div>
      <div className="flex items-center gap-3">
        {(state ?? (p.paid ? 'paid' : 'unpaid')) === 'partial' ? (
          <span className="badge bg-warn/15 text-warn">
            Parcial {p.amountPaid ?? 0} {currency} · debe{' '}
            {amountOwed(fee, p.amountPaid)} {currency}
          </span>
        ) : p.paid ? (
          <span className="badge bg-ok/15 text-ok">
            ✓ Pagado {p.amountPaid && `${p.amountPaid} ${currency}`}
          </span>
        ) : (
          <span className="badge bg-warn/15 text-warn">
            Debe {fee} {currency}
          </span>
        )}
        {p.paid ? (
          <button onClick={onUnpay} disabled={isPending} className="btn-ghost text-xs py-1.5 px-3">
            Marcar impago
          </button>
        ) : entering ? (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              savePayment();
            }}
          >
            <label className="flex items-center gap-1 text-xs text-ink-dim">
              Monto recibido
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                className="input w-24 py-1 text-sm"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-label="Monto recibido"
                aria-invalid={!!amountError}
              />
              {currency}
            </label>
            <button type="submit" disabled={isPending} className="btn-primary text-xs py-1.5 px-3">
              Guardar pago
            </button>
            <button
              type="button"
              onClick={() => {
                setEntering(false);
                setAmountError(null);
              }}
              className="btn-ghost text-xs py-1.5 px-3"
            >
              Cancelar
            </button>
            {amountError && (
              <span role="alert" className="w-full text-xs text-bad">
                {amountError}
              </span>
            )}
          </form>
        ) : (
          <button
            onClick={() => {
              setAmount(String(fee));
              setEntering(true);
            }}
            disabled={isPending}
            className="btn-ghost text-xs py-1.5 px-3"
          >
            Marcar pagado
          </button>
        )}
        <button
          onClick={onRemove}
          disabled={isPending}
          className="btn-danger text-xs py-1.5 px-3"
        >
          Quitar
        </button>
      </div>
    </div>
  );
}

function FinanceCard({
  label,
  value,
  hint,
  warn,
  ariaLabel,
  onClick,
}: {
  label: string;
  value: string;
  hint?: string;
  warn?: boolean;
  ariaLabel?: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <p className="text-xs uppercase tracking-wider text-ink-mute">{label}</p>
      <p className={`display text-2xl mt-1 ${warn ? 'text-warn' : 'text-ink'}`}>{value}</p>
      {hint && <p className="text-xs text-ink-mute mt-1">{hint}</p>}
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        className="card p-4 text-left hover:border-accent transition-colors"
      >
        {body}
      </button>
    );
  }
  return <div className="card p-4">{body}</div>;
}
