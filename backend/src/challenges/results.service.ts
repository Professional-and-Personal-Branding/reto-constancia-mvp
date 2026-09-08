import { Injectable, NotFoundException } from '@nestjs/common';
import { ActivityStatus, ChallengeStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { ChallengePayout, computePayout } from './finance.service';
import { computeScore, describeScoring, isQualified, selectWinners } from './scoring';

export interface ParticipantRanking {
  userId: string;
  name: string;
  email: string;
  validatedDays: number;
  pendingDays: number;
  rejectedDays: number;
  totalKm: number;
  paid: boolean;
  /** Puntaje según las reglas del reto (spec challenge-scoring) */
  score: number;
  /** Cumple el mínimo de días validados y tiene puntaje > 0 */
  qualified: boolean;
}

export interface ChallengeAwardResult {
  userId: string;
  name: string;
  email: string;
  awardedAt: Date;
  notes: string | null;
}

export interface ChallengeResults {
  challengeId: string;
  challengeName: string;
  status: ChallengeStatus;
  totalValidDays: number;
  ranking: ParticipantRanking[];
  topScore: number;
  tiedAtTop: ParticipantRanking[];
  winners: ParticipantRanking[];
  awards: ChallengeAwardResult[];
  drawNeeded: boolean;
  notes: string[];
  /** Reparto del presupuesto entre ganadores (informativo, no altera el ranking) */
  payout: ChallengePayout;
}

@Injectable()
export class ResultsService {
  constructor(private readonly prisma: PrismaService) {}

  async getResults(challengeId: string): Promise<ChallengeResults> {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      include: {
        participants: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
        awards: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
          orderBy: { awardedAt: 'asc' },
        },
      },
    });
    if (!challenge) throw new NotFoundException('Reto no encontrado');

    // Cuenta total de días válidos en el período (referencia, no afecta ranking)
    const totalValidDays = this.countValidDays(
      challenge.startDate,
      challenge.endDate,
      challenge.validDays,
    );

    // Trae todas las actividades del reto en una sola query
    const activities = await this.prisma.dailyActivity.findMany({
      where: { challengeId },
      select: {
        userId: true,
        status: true,
        distanceKm: true,
      },
    });

    // Agrupa por usuario
    const ranking: ParticipantRanking[] = challenge.participants.map((p) => {
      const userActs = activities.filter((a) => a.userId === p.userId);
      const validatedDays = userActs.filter(
        (a) => a.status === ActivityStatus.VALIDATED,
      ).length;
      const pendingDays = userActs.filter(
        (a) => a.status === ActivityStatus.PENDING,
      ).length;
      const rejectedDays = userActs.filter(
        (a) => a.status === ActivityStatus.REJECTED,
      ).length;
      const totalKm = userActs
        .filter((a) => a.status === ActivityStatus.VALIDATED && a.distanceKm)
        .reduce((sum, a) => sum + Number(a.distanceKm), 0);

      const km = Math.round(totalKm * 100) / 100;
      const score = computeScore(challenge, { validatedDays, totalKm: km });

      return {
        userId: p.userId,
        name: p.user.name,
        email: p.user.email,
        validatedDays,
        pendingDays,
        rejectedDays,
        totalKm: km,
        paid: p.paid,
        score,
        qualified: isQualified(challenge, { validatedDays, score }),
      };
    });

    // Ordena: más puntaje primero, luego más kms (desempate suave informativo)
    ranking.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.totalKm - a.totalKm;
    });

    // Solo quienes califican pueden estar en el tope y ganar
    const qualifiedRanking = ranking.filter((r) => r.qualified);
    const topScore = qualifiedRanking[0]?.score ?? 0;
    const tiedAtTop = qualifiedRanking.filter((r) => r.score === topScore && topScore > 0);

    const awards = challenge.awards.map((award) => ({
      userId: award.userId,
      name: award.user.name,
      email: award.user.email,
      awardedAt: award.awardedAt,
      notes: award.notes,
    }));

    const computed = selectWinners(tiedAtTop, challenge);
    const scoringNote = describeScoring(challenge);
    const winners =
      awards.length > 0
        ? ranking.filter((r) => awards.some((award) => award.userId === r.userId))
        : computed.winners;

    return {
      challengeId: challenge.id,
      challengeName: challenge.name,
      status: challenge.status,
      totalValidDays,
      ranking,
      topScore,
      tiedAtTop,
      winners,
      awards,
      drawNeeded: awards.length > 0 ? false : computed.drawNeeded,
      notes: [
        ...(scoringNote ? [scoringNote] : []),
        ...(awards.length > 0
          ? ['Premiación registrada por el administrador.']
          : computed.notes),
      ],
      payout: computePayout(
        challenge.budgetTotal,
        awards.length > 0 ? awards.length : winners.length,
      ),
    };
  }

  /** Cuenta cuántos días del período caen en validDays (referencia para el admin) */
  private countValidDays(
    startDate: Date,
    endDate: Date,
    validDays: number[],
  ): number {
    let count = 0;
    const cur = new Date(startDate);
    const end = new Date(endDate);
    while (cur <= end) {
      if (validDays.includes(cur.getUTCDay())) count++;
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return count;
  }
}
