import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

/**
 * Finanzas del reto (spec: challenge-finance).
 * Funciones puras reutilizadas por el endpoint /finance y por los resultados (payout).
 *
 * - Presupuesto: cuota × inscritos salvo que el admin fije un monto (budgetTotal no nulo).
 * - Pote del premio: lo recaudado (pagos confirmados), no el presupuesto.
 */
export type PaymentState = 'paid' | 'partial' | 'unpaid';
/** Estado de pago que ve cada participante de su propia inscripción (payment-reconciliation). */
export type ParticipantPaymentStatus = 'pending' | 'in_review' | 'partial' | 'paid';
export type BudgetMode = 'auto' | 'manual';

export interface ParticipantFinance {
  userId: string;
  name: string;
  email: string;
  state: PaymentState;
  amountPaid: number;
  paidAt: Date | null;
  /** Comprobante guardado que ningún pago registrado cubre (derivado, no se guarda) */
  proofToReview: boolean;
  proofUploadedAt: Date | null;
}

export interface ChallengeFinance {
  challengeId: string;
  challengeName: string;
  currency: string;
  feePerParticipant: number;
  /** Presupuesto efectivo: el fijado a mano o, si no hay, cuota × inscritos */
  budgetTotal: number;
  budgetMode: BudgetMode;
  participantsTotal: number;
  counts: { paid: number; partial: number; unpaid: number };
  /** Participantes con un comprobante por revisar */
  proofsToReview: number;
  expectedTotal: number;
  collectedTotal: number;
  pendingTotal: number;
  budgetCovered: boolean;
  budgetDelta: number;
  participants: ParticipantFinance[];
}

export interface ChallengePayout {
  pot: number;
  winnersCount: number;
  perWinner: number;
  monetary: boolean;
}

type MoneyLike = number | string | { toString(): string } | null | undefined;

export function toMoney(value: MoneyLike): number {
  if (value === null || value === undefined) return 0;
  const n = Number(typeof value === 'object' ? value.toString() : value);
  return Number.isFinite(n) ? n : 0;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function paymentState(fee: number, paid: boolean, amountPaid: number): PaymentState {
  if (fee <= 0) return 'paid';
  if (!paid) return 'unpaid';
  return amountPaid >= fee ? 'paid' : 'partial';
}

/**
 * Comprobante por revisar (spec challenge-finance): el reto cobra cuota, hay un comprobante guardado
 * y ningún pago registrado lo cubre: el pago no está registrado, o es parcial y el comprobante se
 * subió después del último pago. Fechas iguales cuentan como cubierto. Se deriva, no se guarda.
 */
export function proofToReview(
  fee: number,
  paid: boolean,
  amountPaid: number,
  paidAt: Date | null,
  proofUrl: string | null | undefined,
  proofUploadedAt: Date | null | undefined,
): boolean {
  if (fee <= 0 || !proofUrl) return false;
  if (!paid) return true;
  if (paymentState(fee, paid, amountPaid) !== 'partial') return false;
  if (!proofUploadedAt || !paidAt) return false;
  return proofUploadedAt.getTime() > paidAt.getTime();
}

/** Estado de pago propio: paid > in_review > partial > pending. */
export function participantPaymentStatus(
  fee: number,
  paid: boolean,
  amountPaid: number,
  paidAt: Date | null,
  proofUrl: string | null | undefined,
  proofUploadedAt: Date | null | undefined,
): ParticipantPaymentStatus {
  const state = paymentState(fee, paid, amountPaid);
  if (state === 'paid') return 'paid';
  if (proofToReview(fee, paid, amountPaid, paidAt, proofUrl, proofUploadedAt)) return 'in_review';
  return state === 'partial' ? 'partial' : 'pending';
}

export interface FinanceChallengeInput {
  id: string;
  name: string;
  currency: string;
  feePerParticipant: MoneyLike;
  budgetTotal: MoneyLike;
}

export interface FinanceParticipantInput {
  userId: string;
  paid: boolean;
  amountPaid: MoneyLike;
  paidAt: Date | null;
  paymentProofUrl?: string | null;
  paymentProofUploadedAt?: Date | null;
  user: { name: string; email: string };
}

/**
 * Presupuesto efectivo del reto. NULL en la base = automático: se recalcula en cada lectura,
 * así sigue a las inscripciones y a la cuota sin guardar una copia que pueda quedar vieja.
 */
export function effectiveBudget(
  challenge: Pick<FinanceChallengeInput, 'feePerParticipant' | 'budgetTotal'>,
  participantsCount: number,
): { budget: number; mode: BudgetMode } {
  if (challenge.budgetTotal === null || challenge.budgetTotal === undefined) {
    return { budget: round2(toMoney(challenge.feePerParticipant) * participantsCount), mode: 'auto' };
  }
  return { budget: round2(toMoney(challenge.budgetTotal)), mode: 'manual' };
}

/** Lo recaudado: solo lo confirmado por el admin (paid = true); un comprobante sin confirmar no suma. */
export function collectedTotal(participants: Pick<FinanceParticipantInput, 'paid' | 'amountPaid'>[]): number {
  return round2(participants.reduce((sum, p) => sum + (p.paid ? toMoney(p.amountPaid) : 0), 0));
}

export function computeFinance(
  challenge: FinanceChallengeInput,
  participants: FinanceParticipantInput[],
): ChallengeFinance {
  const fee = toMoney(challenge.feePerParticipant);
  const { budget, mode } = effectiveBudget(challenge, participants.length);

  const rows: ParticipantFinance[] = participants.map((p) => {
    const amount = p.paid ? toMoney(p.amountPaid) : 0;
    return {
      userId: p.userId,
      name: p.user.name,
      email: p.user.email,
      state: paymentState(fee, p.paid, amount),
      amountPaid: round2(amount),
      paidAt: p.paidAt,
      proofToReview: proofToReview(
        fee,
        p.paid,
        amount,
        p.paidAt,
        p.paymentProofUrl,
        p.paymentProofUploadedAt,
      ),
      proofUploadedAt: p.paymentProofUploadedAt ?? null,
    };
  });

  const counts = { paid: 0, partial: 0, unpaid: 0 };
  for (const r of rows) counts[r.state]++;

  const expectedTotal = round2(fee * rows.length);
  const collected = collectedTotal(participants);
  const pendingTotal = round2(Math.max(0, expectedTotal - collected));
  const budgetDelta = round2(collected - budget);

  return {
    challengeId: challenge.id,
    challengeName: challenge.name,
    currency: challenge.currency,
    feePerParticipant: round2(fee),
    budgetTotal: budget,
    budgetMode: mode,
    participantsTotal: rows.length,
    counts,
    proofsToReview: rows.filter((r) => r.proofToReview).length,
    expectedTotal,
    collectedTotal: collected,
    pendingTotal,
    budgetCovered: collected >= budget,
    budgetDelta,
    participants: rows,
  };
}

/**
 * Reparto del pote entre los ganadores; nunca supera el pote. El pote es lo recaudado, y el
 * premio es monetario cuando el reto cobra cuota (un reto con cuota y sin pagos tiene pote 0).
 */
export function computePayout(collected: MoneyLike, winnersCount: number, fee: MoneyLike): ChallengePayout {
  const pot = round2(toMoney(collected));
  const count = Number.isInteger(winnersCount) && winnersCount > 0 ? winnersCount : 0;
  const perWinner = pot > 0 && count > 0 ? Math.floor((pot / count) * 100) / 100 : 0;
  return { pot, winnersCount: count, perWinner, monetary: toMoney(fee) > 0 };
}

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  async getFinance(challengeId: string): Promise<ChallengeFinance> {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      include: {
        participants: {
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });
    if (!challenge) throw new NotFoundException('Reto no encontrado');
    return computeFinance(challenge, challenge.participants);
  }
}
