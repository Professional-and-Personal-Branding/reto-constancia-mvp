'use client';

import { useActiveChallenge } from '@/lib/use-active-challenge';

/** Selector de reto activo. Solo se muestra cuando hay más de un reto activo. */
export function ChallengeSelector() {
  const { challenge, challenges, select } = useActiveChallenge();

  if (challenges.length < 2) return null;

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-ink-mute hidden md:inline">Reto</span>
      <select
        aria-label="Reto activo seleccionado"
        className="input py-1.5 text-sm max-w-[14rem]"
        value={challenge?.id ?? ''}
        onChange={(e) => select(e.target.value)}
      >
        {challenges.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
            {c.isParticipant ? '' : ' (no inscrito)'}
          </option>
        ))}
      </select>
    </label>
  );
}
