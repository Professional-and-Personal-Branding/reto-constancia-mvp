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

/** Inscritos con su usuario, tal como los leen el detalle y la lista de retos activos. */
export const participantsInclude = {
  participants: {
    include: { user: { select: { id: true, name: true, email: true } } },
  },
} satisfies Prisma.ChallengeInclude;

/** Reto con sus inscritos completos (datos de pago incluidos): vista interna y de admin. */
export type ChallengeWithParticipants = Prisma.ChallengeGetPayload<{
  include: typeof participantsInclude;
}>;

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

    assertValidPeriod(new Date(dto.startDate), new Date(dto.endDate));

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
        // Sin monto = presupuesto automático (cuota × inscritos), ver effectiveBudget
        budgetTotal: dto.budgetTotal ?? null,
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
      include: participantsInclude,
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
      include: participantsInclude,
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
    // Un reto cerrado es definitivo: ni reglas, ni fechas, ni volver a borrador. Cambiarlo
    // reescribiría su ranking final y sus ganadores. La premiación sigue permitida (awards).
    if (current.status === ChallengeStatus.COMPLETED) {
      // Volver a pedir el cierre (POST :id/close) es idempotente: no cambia nada
      const onlyClosing = Object.entries(dto).every(
        ([key, value]) => value === undefined || (key === 'status' && value === ChallengeStatus.COMPLETED),
      );
      if (onlyClosing) return current;
      throw new BadRequestException('No se puede modificar un reto cerrado');
    }
    // El período resultante combina lo nuevo con lo guardado, con la misma regla que al crear
    if (dto.startDate !== undefined || dto.endDate !== undefined) {
      assertValidPeriod(
        new Date(dto.startDate ?? current.startDate),
        new Date(dto.endDate ?? current.endDate),
      );
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
    const challenge = await this.openForPayments(challengeId);
    // Pagado sin monto explícito: se registra la cuota del reto (spec challenge-finance)
    let amountPaid: number | null = null;
    if (dto.paid) {
      amountPaid = dto.amountPaid !== undefined ? dto.amountPaid : Number(challenge.feePerParticipant);
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
    await this.openForPayments(challengeId);
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

  /**
   * Los pagos se cierran con el reto: un reto cerrado no admite pagos ni comprobantes, así lo
   * recaudado (el pote del premio) queda fijo. Un pago tardío se registra en el reto siguiente.
   */
  private async openForPayments(challengeId: string) {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      select: { id: true, status: true, feePerParticipant: true },
    });
    if (!challenge) throw new NotFoundException('Reto no encontrado');
    if (challenge.status === ChallengeStatus.COMPLETED) {
      throw new BadRequestException('No se puede modificar un reto cerrado');
    }
    return challenge;
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

/** Regla del período de un reto, compartida por la creación y la edición. */
function assertValidPeriod(start: Date, end: Date): void {
  if (start >= end) {
    throw new BadRequestException('startDate debe ser menor que endDate');
  }
}
