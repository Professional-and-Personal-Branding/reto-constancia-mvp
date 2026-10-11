/**
 * Pruebas de la cola de comprobantes del admin. Sin framework: `node:test` con type stripping.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { amountOwed, applyParticipantFilter, filterCounts, formatUploadDate } from './payment.ts';
import type { ChallengeFinance, ParticipantFinance } from './types.ts';

function row(userId: string, state: ParticipantFinance['state'], proof: string | null, review: boolean) {
  return {
    userId,
    name: userId,
    email: `${userId}@x`,
    state,
    amountPaid: state === 'paid' ? 120 : state === 'partial' ? 60 : 0,
    paidAt: null,
    proofToReview: review,
    proofUploadedAt: proof,
  } satisfies ParticipantFinance;
}

const finance = {
  participantsTotal: 4,
  counts: { paid: 1, partial: 1, unpaid: 2 },
  proofsToReview: 2,
  participants: [
    row('a', 'unpaid', '2026-05-05T10:00:00.000Z', true),
    row('b', 'partial', '2026-05-03T10:00:00.000Z', true),
    row('c', 'paid', null, false),
    row('d', 'unpaid', null, false),
  ],
} as unknown as ChallengeFinance;
const items = ['a', 'b', 'c', 'd'].map((userId) => ({ userId }));
const ids = (list: { userId: string }[]) => list.map((i) => i.userId);

test('filterCounts usa los conteos del resumen', () => {
  assert.deepEqual(filterCounts(finance), { all: 4, review: 2, unpaid: 2, partial: 1, paid: 1 });
});

test('Por revisar lista solo la cola, el comprobante más antiguo primero', () => {
  assert.deepEqual(ids(applyParticipantFilter(items, finance, 'review')), ['b', 'a']);
});

test('los filtros por estado y Todos', () => {
  assert.deepEqual(ids(applyParticipantFilter(items, finance, 'all')), ['a', 'b', 'c', 'd']);
  assert.deepEqual(ids(applyParticipantFilter(items, finance, 'unpaid')), ['a', 'd']);
  assert.deepEqual(ids(applyParticipantFilter(items, finance, 'partial')), ['b']);
  assert.deepEqual(ids(applyParticipantFilter(items, finance, 'paid')), ['c']);
});

test('sin resumen todavía se muestran todos', () => {
  assert.deepEqual(ids(applyParticipantFilter(items, undefined, 'review')), ['a', 'b', 'c', 'd']);
});

test('amountOwed y la fecha de subida', () => {
  assert.equal(amountOwed(120, '60.00'), 60);
  assert.equal(amountOwed(120, null), 120);
  assert.equal(amountOwed(120, '150'), 0);
  assert.match(formatUploadDate('2026-05-03T12:00:00.000Z'), /3/);
});
