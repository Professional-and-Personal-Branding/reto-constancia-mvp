/**
 * Cola de comprobantes y estado de pago propio (spec challenge-finance, cambio
 * payment-reconciliation). La regla de "por revisar" y el estado propio los calcula el servidor;
 * aquí solo se filtran, ordenan y formatean los datos ya calculados.
 */
import type { BulkPaymentResult, ChallengeFinance, ParticipantFinance } from './types.ts';

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

// ----- Pagos en lote y lista de pendientes (spec challenge-finance, cambio bulk-payment-marking) -----

/** Número como lo muestra la fila ("Debe 120 BOB"): hasta 2 decimales, sin separador de miles. */
function money(n: number): string {
  return String(Math.round(n * 100) / 100);
}

function people(n: number): string {
  return `${n} ${n === 1 ? 'persona' : 'personas'}`;
}

export interface BulkPaymentSummary {
  /** Seleccionados sin pago: a ellos se les registrará la cuota */
  count: number;
  total: number;
  /** Frase de la confirmación */
  headline: string;
  /** Seleccionados que el lote no toca, una línea por persona */
  untouched: string[];
}

/** Resumen de la confirmación, calculado del resumen financiero y los ids elegidos. */
export function bulkPaymentSummary(finance: ChallengeFinance, selectedIds: string[]): BulkPaymentSummary {
  const chosen = new Set(selectedIds);
  const fee = finance.feePerParticipant;
  const cur = finance.currency;
  let count = 0;
  const untouched: string[] = [];
  for (const p of finance.participants) {
    if (!chosen.has(p.userId)) continue;
    if (p.state === 'unpaid') count += 1;
    else if (p.state === 'partial') untouched.push(`${p.name}: pago parcial de ${money(p.amountPaid)} ${cur}`);
    else if (Math.round(p.amountPaid * 100) === Math.round(fee * 100)) untouched.push(`${p.name}: ya pagado`);
    else untouched.push(`${p.name}: pagó ${money(p.amountPaid)} ${cur}`);
  }
  const total = Math.round(count * fee * 100) / 100;
  const headline =
    count > 0
      ? `Se registrará la cuota de ${money(fee)} ${cur} a ${people(count)}: ${money(total)} ${cur}.`
      : 'Ninguna de las personas seleccionadas está sin pagar.';
  return { count, total, headline, untouched };
}

/** Une los resultados de varios lotes en uno solo. */
export function mergeBulkPayments(results: BulkPaymentResult[]): BulkPaymentResult {
  return {
    feePerParticipant: results[0]?.feePerParticipant ?? 0,
    currency: results[0]?.currency ?? '',
    marked: results.flatMap((r) => r.marked),
    alreadyPaid: results.flatMap((r) => r.alreadyPaid),
    excluded: results.flatMap((r) => r.excluded),
    skipped: results.flatMap((r) => r.skipped),
  };
}

/**
 * Mensaje tras el lote, por ejemplo
 * "2 pagos registrados · 1 ya estaba pagado · 1 sin tocar (pago parcial o monto distinto): Carla".
 */
export function bulkPaymentMessage(result: BulkPaymentResult): string {
  const parts: string[] = [];
  const marked = result.marked.length;
  if (marked > 0) parts.push(`${marked} ${marked === 1 ? 'pago registrado' : 'pagos registrados'}`);
  const already = result.alreadyPaid.length;
  if (already > 0) parts.push(already === 1 ? '1 ya estaba pagado' : `${already} ya estaban pagados`);
  const excluded = result.excluded.length;
  if (excluded > 0) {
    const names = result.excluded.map((e) => e.name).join(', ');
    parts.push(`${excluded} sin tocar (pago parcial o monto distinto): ${names}`);
  }
  const skipped = result.skipped.length;
  if (skipped > 0) parts.push(`${skipped} ${skipped === 1 ? 'omitido' : 'omitidos'} (no inscrito)`);
  return parts.length > 0 ? parts.join(' · ') : 'Sin cambios';
}

/**
 * Lista de quienes aún deben, para pegar en el grupo: una línea por persona sin pago o con pago
 * parcial, ordenada por nombre, y el total adeudado. Solo nombres: nunca emails.
 * Devuelve `count` 0 y texto vacío si nadie debe.
 */
export function pendingPaymentsText(finance: ChallengeFinance): { count: number; text: string } {
  const fee = finance.feePerParticipant;
  const rows = finance.participants
    .filter((p) => p.state === 'unpaid' || p.state === 'partial')
    .map((p) => ({
      name: p.name,
      owed: p.state === 'unpaid' ? fee : amountOwed(fee, p.amountPaid),
      review: p.proofToReview,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  if (rows.length === 0) return { count: 0, text: '' };
  const cur = finance.currency;
  const lines = rows.map((r) => `${r.name}: ${money(r.owed)} ${cur}${r.review ? ' (comprobante por revisar)' : ''}`);
  const total = rows.reduce((sum, r) => sum + r.owed, 0);
  lines.push(`Total adeudado: ${money(total)} ${cur}`);
  return { count: rows.length, text: lines.join('\n') };
}
