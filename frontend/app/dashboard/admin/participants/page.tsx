'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useActiveChallenge } from '@/lib/use-active-challenge';
import type { ChallengeFinance, ChallengeParticipant, PaymentState, SafeUser } from '@/lib/types';

export default function ParticipantsPage() {
  const qc = useQueryClient();

  const { challenge } = useActiveChallenge();

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

  const fee = parseFloat(challenge.feePerParticipant);
  const stateOf = (userId: string): PaymentState | undefined =>
    finance?.participants.find((f) => f.userId === userId)?.state;

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
        <section aria-label="Resumen financiero" className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
            hint={`${finance.budgetTotal} ${finance.currency}${
              finance.budgetCovered && finance.budgetDelta > 0
                ? ` · excedente ${finance.budgetDelta}`
                : ''
            }`}
            warn={!finance.budgetCovered}
          />
        </section>
      )}

      <div className="card p-5">
        <h2 className="display text-xl tracking-wider mb-4">Inscritos</h2>
        {participants && participants.length > 0 ? (
          <div className="divide-y divide-line -mx-5">
            {participants.map((p) => (
              <ParticipantRow
                key={p.id}
                participant={p}
                fee={fee}
                currency={challenge.currency}
                state={stateOf(p.userId)}
                onTogglePayment={() =>
                  paymentMut.mutate({
                    userId: p.userId,
                    paid: !p.paid,
                    amountPaid: !p.paid ? fee : undefined,
                  })
                }
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

      <div className="card p-5">
        <h2 className="display text-xl tracking-wider mb-4">Agregar participante</h2>
        {candidates && candidates.length > 0 ? (
          <div className="space-y-2">
            {candidates.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between gap-3 p-3 rounded-md border border-line"
              >
                <div>
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
  onTogglePayment,
  onRemove,
  isPending,
}: {
  participant: ChallengeParticipant;
  fee: number;
  currency: string;
  state?: PaymentState;
  onTogglePayment: () => void;
  onRemove: () => void;
  isPending: boolean;
}) {
  return (
    <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="font-medium">{p.user.name}</p>
        <p className="text-xs text-ink-mute">{p.user.email}</p>
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
            {Math.round((fee - parseFloat(p.amountPaid ?? '0')) * 100) / 100} {currency}
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
        <button
          onClick={onTogglePayment}
          disabled={isPending}
          className="btn-ghost text-xs py-1.5 px-3"
        >
          {p.paid ? 'Marcar impago' : 'Marcar pagado'}
        </button>
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
}: {
  label: string;
  value: string;
  hint?: string;
  warn?: boolean;
}) {
  return (
    <div className="card p-4">
      <p className="text-xs uppercase tracking-wider text-ink-mute">{label}</p>
      <p className={`display text-2xl mt-1 ${warn ? 'text-warn' : 'text-ink'}`}>{value}</p>
      {hint && <p className="text-xs text-ink-mute mt-1">{hint}</p>}
    </div>
  );
}
