/**
 * Cola de comprobantes y estado de pago propio (spec challenge-finance, cambio
 * payment-reconciliation). La regla de "por revisar" y el estado propio los calcula el servidor;
 * aquí solo se filtran, ordenan y formatean los datos ya calculados.
 */
import type { ChallengeFinance, ParticipantFinance } from './types.ts';

export type ParticipantFilter = 'all' | 'review' | 'unpaid' | 'partial' | 'paid';

export const PARTICIPANT_FILTERS: { key: ParticipantFilter; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'review', label: 'Por revisar' },
  { key: 'unpaid', label: 'Sin pagar' },
  { key: 'partial', label: 'Parciales' },
  { key: 'paid', label: 'Pagados' },
];

/** Conteo de cada filtro, tal como lo informa /finance. */
export function filterCounts(finance: ChallengeFinance): Record<ParticipantFilter, number> {
  return {
    all: finance.participantsTotal,
    review: finance.proofsToReview,
    unpaid: finance.counts.unpaid,
    partial: finance.counts.partial,
    paid: finance.counts.paid,
  };
}

function matches(filter: ParticipantFilter, row: ParticipantFinance | undefined): boolean {
  if (filter === 'all') return true;
  if (!row) return false;
  if (filter === 'review') return row.proofToReview;
  return row.state === filter;
}

/** Filas del filtro elegido; "Por revisar" va con el comprobante más antiguo primero. */
export function applyParticipantFilter<T extends { userId: string }>(
  items: T[],
  finance: ChallengeFinance | undefined,
  filter: ParticipantFilter,
): T[] {
  if (filter === 'all' || !finance) return items;
  const byUser = new Map(finance.participants.map((p) => [p.userId, p]));
  const kept = items.filter((item) => matches(filter, byUser.get(item.userId)));
  if (filter !== 'review') return kept;
  const uploadedAt = (item: T) => {
    const iso = byUser.get(item.userId)?.proofUploadedAt;
    return iso ? new Date(iso).getTime() : Number.MAX_SAFE_INTEGER;
  };
  return [...kept].sort((a, b) => uploadedAt(a) - uploadedAt(b));
}

/** Fecha en que se subió un comprobante (instante, hora local del navegador). */
export function formatUploadDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-BO', { day: '2-digit', month: 'short' });
}

/** Lo que aún se debe de la cuota, con la aritmética de visualización de la página de participantes. */
export function amountOwed(fee: number, amountPaid: string | number | null): number {
  const paid = typeof amountPaid === 'number' ? amountPaid : parseFloat(amountPaid ?? '0');
  return Math.max(0, Math.round((fee - (Number.isFinite(paid) ? paid : 0)) * 100) / 100);
}
