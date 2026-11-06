/**
 * Pruebas de la cola de comprobantes del admin. Sin framework: `node:test` con type stripping.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  amountOwed,
  applyParticipantFilter,
  bulkPaymentMessage,
  bulkPaymentSummary,
  filterCounts,
  formatUploadDate,
  mergeBulkPayments,
  pendingPaymentsText,
} from './payment.ts';
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

function money(userId: string, name: string, state: ParticipantFinance['state'], amountPaid: number, review = false) {
  return { ...row(userId, state, null, review), name, amountPaid };
}

const lote = {
  currency: 'BOB',
  feePerParticipant: 120,
  participants: [
    money('ana', 'Ana', 'unpaid', 0),
    money('luis', 'Luis', 'unpaid', 0),
    money('bea', 'Bea', 'paid', 120),
    money('carla', 'Carla', 'partial', 60, true),
    money('diego', 'Diego', 'paid', 150),
  ],
} as unknown as ChallengeFinance;

test('Pagos en lote: el resumen de confirmación cuenta solo a quien no tiene pago y lista aparte al resto', () => {
  const s = bulkPaymentSummary(lote, ['ana', 'luis', 'bea', 'carla', 'diego']);
  assert.equal(s.count, 2);
  assert.equal(s.total, 240);
  assert.equal(s.headline, 'Se registrará la cuota de 120 BOB a 2 personas: 240 BOB.');
  assert.deepEqual(s.untouched, [
    'Bea: ya pagado',
    'Carla: pago parcial de 60 BOB',
    'Diego: pagó 150 BOB',
  ]);
  const one = bulkPaymentSummary(lote, ['ana']);
  assert.equal(one.headline, 'Se registrará la cuota de 120 BOB a 1 persona: 120 BOB.');
  const none = bulkPaymentSummary(lote, ['carla']);
  assert.equal(none.count, 0);
  assert.equal(none.headline, 'Ninguna de las personas seleccionadas está sin pagar.');
});

test('Pagos en lote: el mensaje del resultado usa singular y plural', () => {
  const entry = (userId: string, name: string, amountPaid = 120) => ({ userId, name, email: `${userId}@x`, amountPaid });
  const plural = {
    feePerParticipant: 120,
    currency: 'BOB',
    marked: [entry('a', 'Ana'), entry('l', 'Luis')],
    alreadyPaid: [entry('b', 'Bea'), entry('e', 'Eva')],
    excluded: [{ ...entry('c', 'Carla', 60), reason: 'PARTIAL' as const }],
    skipped: [
      { userId: 'x', reason: 'NOT_ENROLLED' as const, message: 'No está inscrito en este reto' },
      { userId: 'y', reason: 'NOT_ENROLLED' as const, message: 'No está inscrito en este reto' },
    ],
  };
  assert.equal(
    bulkPaymentMessage(plural),
    '2 pagos registrados · 2 ya estaban pagados · 1 sin tocar (pago parcial o monto distinto): Carla · 2 omitidos (no inscrito)',
  );
  const single = { ...plural, marked: [entry('a', 'Ana')], alreadyPaid: [entry('b', 'Bea')], excluded: [], skipped: [plural.skipped[0]] };
  assert.equal(bulkPaymentMessage(single), '1 pago registrado · 1 ya estaba pagado · 1 omitido (no inscrito)');
  assert.equal(bulkPaymentMessage({ ...single, marked: [], alreadyPaid: [], skipped: [] }), 'Sin cambios');
  const merged = mergeBulkPayments([plural, single]);
  assert.equal(merged.marked.length, 3);
  assert.equal(merged.skipped.length, 3);
});

test('Pendientes: una línea por persona sin pago o con pago parcial, ordenada por nombre y sin emails', () => {
  const { count, text } = pendingPaymentsText({
    ...lote,
    participants: [
      money('z', 'Zoe', 'unpaid', 0),
      money('b', 'Bea', 'paid', 120),
      money('a', 'Ana', 'unpaid', 0),
      money('c', 'Álvaro', 'partial', 90.5),
    ],
  } as unknown as ChallengeFinance);
  assert.equal(count, 3);
  assert.equal(text, 'Álvaro: 29.5 BOB\nAna: 120 BOB\nZoe: 120 BOB\nTotal adeudado: 269.5 BOB');
  assert.doesNotMatch(text, /@/);
  assert.deepEqual(pendingPaymentsText({ ...lote, participants: [money('b', 'Bea', 'paid', 120)] } as unknown as ChallengeFinance), {
    count: 0,
    text: '',
  });
});

test('Pendientes: marca el comprobante por revisar y suma el total adeudado', () => {
  const { text } = pendingPaymentsText({
    ...lote,
    participants: [money('ana', 'Ana', 'unpaid', 0), money('carla', 'Carla', 'partial', 60, true)],
  } as unknown as ChallengeFinance);
  assert.equal(text, 'Ana: 120 BOB\nCarla: 60 BOB (comprobante por revisar)\nTotal adeudado: 180 BOB');
});
