'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useActiveChallenge } from '@/lib/use-active-challenge';
import type { ChallengeParticipant, SafeUser } from '@/lib/types';

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
  const paidCount = participants?.filter((p) => p.paid).length ?? 0;
  const totalPaid = participants
    ?.filter((p) => p.paid)
    .reduce((sum, p) => sum + (p.amountPaid ? parseFloat(p.amountPaid) : 0), 0);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-accent text-xs uppercase tracking-[0.2em] font-semibold mb-2">
          {challenge.name}
        </p>
        <h1 className="display text-5xl leading-none">Participantes</h1>
        <p className="text-ink-dim mt-3">
          {participants?.length ?? 0} inscritos · {paidCount} pagados · {totalPaid ?? 0}{' '}
          {challenge.currency} recaudados
        </p>
      </div>

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
  onTogglePayment,
  onRemove,
  isPending,
}: {
  participant: ChallengeParticipant;
  fee: number;
  currency: string;
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
        {p.paid ? (
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
