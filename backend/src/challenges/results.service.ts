import { Injectable, NotFoundException } from '@nestjs/common';
import { ActivityStatus, ChallengeStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

export interface ParticipantRanking {
  userId: string;
  name: string;
  email: string;
  validatedDays: number;
  pendingDays: number;
  rejectedDays: number;
  totalKm: number;
  paid: boolean;
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

      return {
        userId: p.userId,
        name: p.user.name,
        email: p.user.email,
        validatedDays,
        pendingDays,
        rejectedDays,
        totalKm: Math.round(totalKm * 100) / 100,
        paid: p.paid,
      };
    });

    // Ordena: más días validados primero, luego más kms (desempate suave informativo)
    ranking.sort((a, b) => {
      if (b.validatedDays !== a.validatedDays)
        return b.validatedDays - a.validatedDays;
      return b.totalKm - a.totalKm;
    });

    const topScore = ranking[0]?.validatedDays ?? 0;
    const tiedAtTop = ranking.filter((r) => r.validatedDays === topScore && topScore > 0);

    const awards = challenge.awards.map((award) => ({
      userId: award.userId,
      name: award.user.name,
      email: award.user.email,
      awardedAt: award.awardedAt,
      notes: award.notes,
    }));

    const computed = this.computeWinners(tiedAtTop);
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
      notes:
        awards.length > 0
          ? ['Premiación registrada por el administrador.']
          : computed.notes,
    };
  }

  /**
   * Reglas:
   *  - 1 persona en el tope -> gana sola
   *  - 2 empatadas -> ganan ambas, presupuesto se divide
   *  - 3+ empatadas -> sorteo aleatorio, eligen 2
   *  - 0 con días validados -> sin ganador
   */
  private computeWinners(tied: ParticipantRanking[]): {
    winners: ParticipantRanking[];
    drawNeeded: boolean;
    notes: string[];
  } {
    const notes: string[] = [];

    if (tied.length === 0) {
      notes.push('Aún no hay actividades validadas, sin ganador definido.');
      return { winners: [], drawNeeded: false, notes };
    }

    if (tied.length === 1) {
      notes.push('Ganador único, sin empate.');
      return { winners: tied, drawNeeded: false, notes };
    }

    if (tied.length === 2) {
      notes.push(
        'Empate de 2 personas: ambas ganan, el presupuesto se divide.',
      );
      return { winners: tied, drawNeeded: false, notes };
    }

    // 3+ empatadas: sorteo
    const shuffled = [...tied].sort(() => Math.random() - 0.5);
    const winners = shuffled.slice(0, 2);
    notes.push(
      `Empate de ${tied.length} personas: se hizo sorteo aleatorio entre los empatados. ` +
        'Ganan dos de ellos.',
    );
    return { winners, drawNeeded: true, notes };
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
