import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

/**
 * Finanzas del reto (spec: challenge-finance).
 * Funciones puras reutilizadas por el endpoint /finance y por los resultados (payout).
 */
export type PaymentState = 'paid' | 'partial' | 'unpaid';

export interface ParticipantFinance {
  userId: string;
  name: string;
  email: string;
  state: PaymentState;
  amountPaid: number;
  paidAt: Date | null;
}

export interface ChallengeFinance {
  challengeId: string;
  challengeName: string;
  currency: string;
  feePerParticipant: number;
  budgetTotal: number;
  participantsTotal: number;
  counts: { paid: number; partial: number; unpaid: number };
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
  user: { name: string; email: string };
}

export function computeFinance(
  challenge: FinanceChallengeInput,
  participants: FinanceParticipantInput[],
): ChallengeFinance {
  const fee = toMoney(challenge.feePerParticipant);
  const budget = toMoney(challenge.budgetTotal);

  const rows: ParticipantFinance[] = participants.map((p) => {
    const amount = p.paid ? toMoney(p.amountPaid) : 0;
    return {
      userId: p.userId,
      name: p.user.name,
      email: p.user.email,
      state: paymentState(fee, p.paid, amount),
      amountPaid: round2(amount),
      paidAt: p.paidAt,
    };
  });

  const counts = { paid: 0, partial: 0, unpaid: 0 };
  for (const r of rows) counts[r.state]++;

  const expectedTotal = round2(fee * rows.length);
  // Solo cuenta lo confirmado por el admin (paid = true); un comprobante sin confirmar no suma
  const collectedTotal = round2(
    participants.reduce((sum, p) => sum + (p.paid ? toMoney(p.amountPaid) : 0), 0),
  );
  const pendingTotal = round2(Math.max(0, expectedTotal - collectedTotal));
  const budgetDelta = round2(collectedTotal - budget);

  return {
    challengeId: challenge.id,
    challengeName: challenge.name,
    currency: challenge.currency,
    feePerParticipant: round2(fee),
    budgetTotal: round2(budget),
    participantsTotal: rows.length,
    counts,
    expectedTotal,
    collectedTotal,
    pendingTotal,
    budgetCovered: collectedTotal >= budget,
    budgetDelta,
    participants: rows,
  };
}

/** Reparto del pote (presupuesto del reto) entre los ganadores; nunca supera el pote. */
export function computePayout(budgetTotal: MoneyLike, winnersCount: number): ChallengePayout {
  const pot = round2(toMoney(budgetTotal));
  const count = Number.isInteger(winnersCount) && winnersCount > 0 ? winnersCount : 0;
  const perWinner = pot > 0 && count > 0 ? Math.floor((pot / count) * 100) / 100 : 0;
  return { pot, winnersCount: count, perWinner, monetary: pot > 0 };
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
