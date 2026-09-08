import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Challenge, ChallengeStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CreateChallengeDto } from './dto/create-challenge.dto';
import { UpdateChallengeDto } from './dto/update-challenge.dto';
import { MarkPaymentDto } from './dto/mark-payment.dto';
import { PaymentProofDto } from './dto/payment-proof.dto';

@Injectable()
export class ChallengesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateChallengeDto): Promise<Challenge> {
    const exists = await this.prisma.challenge.findUnique({
      where: { month_year: { month: dto.month, year: dto.year } },
    });
    if (exists) {
      throw new ConflictException(
        `Ya existe un reto para ${dto.month}/${dto.year}`,
      );
    }

    if (new Date(dto.startDate) >= new Date(dto.endDate)) {
      throw new BadRequestException('startDate debe ser menor que endDate');
    }

    return this.prisma.challenge.create({
      data: {
        name: dto.name,
        month: dto.month,
        year: dto.year,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        validDays: dto.validDays ?? [1, 2, 3, 4, 5, 6],
        minHeartRateMinutes: dto.minHeartRateMinutes ?? 20,
        feePerParticipant: dto.feePerParticipant ?? 0,
        budgetTotal: dto.budgetTotal ?? 0,
        currency: dto.currency ?? 'BOB',
        prizeDescription: dto.prizeDescription,
        // Reglas de puntaje: undefined deja el default del modelo (spec challenge-scoring)
        pointsPerValidatedDay: dto.pointsPerValidatedDay,
        pointsPerKm: dto.pointsPerKm,
        minValidatedDaysToQualify: dto.minValidatedDaysToQualify,
        maxWinners: dto.maxWinners,
        tiebreakRule: dto.tiebreakRule,
      },
    });
  }

  findAll() {
    return this.prisma.challenge.findMany({
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      include: { _count: { select: { participants: true, activities: true } } },
    });
  }

  /**
   * Todos los retos ACTIVE (puede haber varios a la vez), del más reciente al más antiguo,
   * con `isParticipant` calculado para el usuario que consulta.
   */
  async findActiveList(userId?: string) {
    const list = await this.prisma.challenge.findMany({
      where: { status: ChallengeStatus.ACTIVE },
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
      include: {
        participants: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    });
    return list.map((challenge) => ({
      ...challenge,
      isParticipant:
        !!userId && challenge.participants.some((p) => p.userId === userId),
    }));
  }

  /**
   * Reto activo "por defecto" para el usuario: el más reciente en el que participa;
   * si no participa en ninguno, el activo más reciente; si no hay activos, null.
   */
  async findActive(userId?: string) {
    const list = await this.findActiveList(userId);
    if (list.length === 0) return null;
    const chosen = list.find((c) => c.isParticipant) ?? list[0];
    const { isParticipant, ...challenge } = chosen;
    void isParticipant;
    return challenge;
  }

  /**
   * Transición de ciclo de vida DRAFT -> ACTIVE. Idempotente si ya está activo.
   * Un reto COMPLETED no puede reactivarse. Varios retos pueden estar activos a la vez.
   */
  async activate(id: string): Promise<Challenge> {
    const challenge = await this.prisma.challenge.findUnique({ where: { id } });
    if (!challenge) throw new NotFoundException('Reto no encontrado');
    if (challenge.status === ChallengeStatus.ACTIVE) return challenge;
    if (challenge.status === ChallengeStatus.COMPLETED) {
      throw new BadRequestException('Un reto cerrado no puede reactivarse');
    }
    return this.prisma.challenge.update({
      where: { id },
      data: { status: ChallengeStatus.ACTIVE },
    });
  }

  async findOne(id: string) {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id },
      include: {
        participants: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    });
    if (!challenge) throw new NotFoundException('Reto no encontrado');
    return challenge;
  }

  async update(id: string, dto: UpdateChallengeDto): Promise<Challenge> {
    let current: Challenge = await this.findOne(id);
    // Activar vía PATCH pasa por las mismas reglas de ciclo de vida que POST :id/activate
    if (dto.status === ChallengeStatus.ACTIVE) {
      current = await this.activate(id);
    }
    const data: Prisma.ChallengeUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.startDate !== undefined) data.startDate = new Date(dto.startDate);
    if (dto.endDate !== undefined) data.endDate = new Date(dto.endDate);
    if (dto.validDays !== undefined) data.validDays = dto.validDays;
    if (dto.minHeartRateMinutes !== undefined)
      data.minHeartRateMinutes = dto.minHeartRateMinutes;
    if (dto.feePerParticipant !== undefined)
      data.feePerParticipant = dto.feePerParticipant;
    if (dto.budgetTotal !== undefined) data.budgetTotal = dto.budgetTotal;
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.prizeDescription !== undefined)
      data.prizeDescription = dto.prizeDescription;
    if (dto.pointsPerValidatedDay !== undefined)
      data.pointsPerValidatedDay = dto.pointsPerValidatedDay;
    if (dto.pointsPerKm !== undefined) data.pointsPerKm = dto.pointsPerKm;
    if (dto.minValidatedDaysToQualify !== undefined)
      data.minValidatedDaysToQualify = dto.minValidatedDaysToQualify;
    if (dto.maxWinners !== undefined) data.maxWinners = dto.maxWinners;
    if (dto.tiebreakRule !== undefined) data.tiebreakRule = dto.tiebreakRule;
    if (dto.status !== undefined && dto.status !== ChallengeStatus.ACTIVE) {
      data.status = dto.status;
    }

    if (Object.keys(data).length === 0) return current;
    return this.prisma.challenge.update({ where: { id }, data });
  }

  // ----- Participants -----

  async addParticipant(challengeId: string, userId: string) {
    const [challenge, user] = await Promise.all([
      this.prisma.challenge.findUnique({ where: { id: challengeId } }),
      this.prisma.user.findUnique({ where: { id: userId } }),
    ]);
    if (!challenge) throw new NotFoundException('Reto no encontrado');
    if (!user) throw new NotFoundException('Usuario no encontrado');
    if (challenge.status === ChallengeStatus.COMPLETED) {
      throw new BadRequestException('No se puede modificar un reto cerrado');
    }

    try {
      return await this.prisma.challengeParticipant.create({
        data: { challengeId, userId },
        include: { user: { select: { id: true, name: true, email: true } } },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('El usuario ya participa en este reto');
      }
      throw e;
    }
  }

  async removeParticipant(challengeId: string, userId: string) {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
    });
    if (!challenge) throw new NotFoundException('Reto no encontrado');
    if (challenge.status === ChallengeStatus.COMPLETED) {
      throw new BadRequestException('No se puede modificar un reto cerrado');
    }
    await this.prisma.challengeParticipant.delete({
      where: { challengeId_userId: { challengeId, userId } },
    });
  }

  async markPayment(
    challengeId: string,
    userId: string,
    dto: MarkPaymentDto,
  ) {
    // Pagado sin monto explícito: se registra la cuota del reto (spec challenge-finance)
    let amountPaid: number | null = null;
    if (dto.paid) {
      if (dto.amountPaid !== undefined) {
        amountPaid = dto.amountPaid;
      } else {
        const challenge = await this.prisma.challenge.findUnique({
          where: { id: challengeId },
          select: { feePerParticipant: true },
        });
        amountPaid = challenge ? Number(challenge.feePerParticipant) : 0;
      }
    }
    return this.prisma.challengeParticipant.update({
      where: { challengeId_userId: { challengeId, userId } },
      data: {
        paid: dto.paid,
        paidAt: dto.paid ? new Date() : null,
        amountPaid,
        paymentProofUrl: dto.paymentProofUrl,
        paymentProofCloudinaryId: dto.paymentProofCloudinaryId,
        paymentProofUploadedAt: dto.paymentProofUrl ? new Date() : undefined,
      },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
  }

  async uploadPaymentProof(
    challengeId: string,
    userId: string,
    dto: PaymentProofDto,
  ) {
    return this.prisma.challengeParticipant.update({
      where: { challengeId_userId: { challengeId, userId } },
      data: {
        paymentProofUrl: dto.paymentProofUrl,
        paymentProofCloudinaryId: dto.paymentProofCloudinaryId,
        paymentProofUploadedAt: new Date(),
      },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
  }

  async award(challengeId: string, userIds: string[], notes?: string) {
    const challenge = await this.findOne(challengeId);
    const participantIds = new Set(challenge.participants.map((p) => p.userId));
    const invalidIds = userIds.filter((userId) => !participantIds.has(userId));

    if (invalidIds.length > 0) {
      throw new BadRequestException('Solo se puede premiar a participantes del reto');
    }

    await this.prisma.$transaction([
      this.prisma.challenge.update({
        where: { id: challengeId },
        data: { status: ChallengeStatus.COMPLETED },
      }),
      this.prisma.challengeAward.deleteMany({ where: { challengeId } }),
      ...userIds.map((userId) =>
        this.prisma.challengeAward.create({
          data: {
            challengeId,
            userId,
            notes,
          },
        }),
      ),
    ]);

    return this.prisma.challengeAward.findMany({
      where: { challengeId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { awardedAt: 'asc' },
    });
  }

  listParticipants(challengeId: string) {
    return this.prisma.challengeParticipant.findMany({
      where: { challengeId },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true, active: true },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });
  }

  // ----- Helpers -----

  isValidDay(challenge: Challenge, date: Date): boolean {
    const dayOfWeek = date.getUTCDay(); // 0..6
    return challenge.validDays.includes(dayOfWeek);
  }

  isWithinPeriod(challenge: Challenge, date: Date): boolean {
    return date >= challenge.startDate && date <= challenge.endDate;
  }
}
