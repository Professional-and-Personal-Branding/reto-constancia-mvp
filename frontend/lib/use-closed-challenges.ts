'use client';

import { useQuery } from '@tanstack/react-query';

import { api } from './api';
import type { Challenge } from './types';

/**
 * Retos cerrados (COMPLETED), del que terminó más recientemente al más antiguo. Se usan en el
 * Ranking para consultar resultados finales; no afectan al reto activo elegido en el encabezado.
 */
export function useClosedChallenges() {
  const query = useQuery<Challenge[]>({
    queryKey: ['challenge', 'closed-list'],
    queryFn: async () => {
      const all = await api<Challenge[]>('/challenges');
      return all
        .filter((c) => c.status === 'COMPLETED')
        .sort((a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime());
    },
  });
  return { closed: query.data ?? [], isLoading: query.isLoading };
}
