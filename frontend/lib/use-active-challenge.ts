'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Challenge } from '@/lib/types';

/** Reto activo tal como lo devuelve `GET /challenges/active/list`. */
export type ActiveChallenge = Challenge & { isParticipant: boolean };

export const SELECTED_CHALLENGE_KEY = 'reto.selectedChallengeId';

// --- Pequeño store externo para que header y páginas reaccionen al mismo cambio ---
const listeners = new Set<() => void>();

function readStoredId(): string | null {
  try {
    return window.localStorage.getItem(SELECTED_CHALLENGE_KEY);
  } catch {
    return null;
  }
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  const onStorage = (e: StorageEvent) => {
    if (e.key === SELECTED_CHALLENGE_KEY) callback();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(callback);
    window.removeEventListener('storage', onStorage);
  };
}

function getServerSnapshot(): string | null {
  return null;
}

export function setSelectedChallengeId(id: string | null): void {
  try {
    if (id) window.localStorage.setItem(SELECTED_CHALLENGE_KEY, id);
    else window.localStorage.removeItem(SELECTED_CHALLENGE_KEY);
  } catch {
    // localStorage puede no estar disponible (modo privado, previews); la selección vive solo en memoria
  }
  listeners.forEach((l) => l());
}

/** Regla de preferencia (misma que el backend): primero donde participo, si no el más reciente. */
export function pickDefaultChallenge(list: ActiveChallenge[]): ActiveChallenge | null {
  return list.find((c) => c.isParticipant) ?? list[0] ?? null;
}

/**
 * Reto activo "seleccionado" por el usuario. Con un solo reto activo la selección es implícita;
 * con varios, el usuario elige desde el header y la elección persiste en este navegador.
 */
export function useActiveChallenge() {
  const query = useQuery<ActiveChallenge[]>({
    queryKey: ['challenge', 'active-list'],
    queryFn: () => api<ActiveChallenge[]>('/challenges/active/list'),
  });

  const storedId = useSyncExternalStore(subscribe, readStoredId, getServerSnapshot);

  const challenges = query.data ?? [];
  const challenge =
    challenges.find((c) => c.id === storedId) ?? pickDefaultChallenge(challenges);

  const select = useCallback((id: string) => setSelectedChallengeId(id), []);

  return { challenge, challenges, isLoading: query.isLoading, select };
}
