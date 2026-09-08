import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActivityStatus,
  ChallengeStatus,
  PhotoType,
  Prisma,
  UserRole,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { ChallengesService } from '../challenges/challenges.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { QueryActivitiesDto } from './dto/query-activities.dto';
import { ValidateActivityDto } from './dto/validate-activity.dto';
import {
  assessHeartRate,
  HeartRateAssessment,
  HeartRateInput,
  HeartRateRule,
} from './heart-rate-rule';

@Injectable()
export class ActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly challenges: ChallengesService,
  ) {}

  /** Regla de FC del reto (pura). Ver heart-rate-rule.ts y la spec activity-heart-rate-compliance. */
  assessHeartRate(rule: HeartRateRule, activity: HeartRateInput): HeartRateAssessment {
    return assessHeartRate(rule, activity);
  }

  /** Agrega `heartRateCompliant` (derivado, no almacenado) a una actividad. */
  private withCompliance<T extends HeartRateInput & { challenge?: HeartRateRule | null }>(
    activity: T,
    rule?: HeartRateRule | null,
  ): T & { heartRateCompliant: boolean } {
    const effective = rule ?? activity.challenge ?? null;
    return {
      ...activity,
      heartRateCompliant: effective
        ? assessHeartRate(effective, activity).compliant
        : true,
    };
  }

  async create(userId: string, dto: CreateActivityDto) {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id: dto.challengeId },
    });
    if (!challenge) throw new NotFoundException('Reto no encontrado');
    if (challenge.status !== ChallengeStatus.ACTIVE) {
      throw new BadRequestException('El reto no está activo');
    }

    // Verifica que el usuario sea participante
    const participation = await this.prisma.challengeParticipant.findUnique({
      where: { challengeId_userId: { challengeId: dto.challengeId, userId } },
    });
    if (!participation) {
      throw new ForbiddenException('No participas en este reto');
    }

    const activityDate = new Date(dto.date);
    activityDate.setUTCHours(0, 0, 0, 0);

    if (!this.challenges.isWithinPeriod(challenge, activityDate)) {
      throw new BadRequestException(
        'La fecha está fuera del período del reto',
      );
    }

    if (!this.challenges.isValidDay(challenge, activityDate)) {
      throw new BadRequestException(
        'Ese día de la semana no es válido para este reto',
      );
    }

    // Regla de FC: la prueba se deriva de las fotos (no del flag del cliente)
    const hasHeartRateProof = dto.photos.some(
      (p) => (p.type ?? PhotoType.ACTIVITY) === PhotoType.HEART_RATE,
    );
    if (
      dto.heartRateMinutes !== undefined &&
      dto.heartRateMinutes > dto.durationMinutes
    ) {
      throw new BadRequestException(
        'Los minutos con FC no pueden superar la duración de la actividad',
      );
    }
    const assessment = assessHeartRate(challenge, {
      heartRateMinutes: dto.heartRateMinutes ?? null,
      hasHeartRateProof,
    });
    if (!assessment.compliant) {
      throw new BadRequestException(assessment.reasons.join('. '));
    }

    try {
      const created = await this.prisma.dailyActivity.create({
        data: {
          challengeId: dto.challengeId,
          userId,
          date: activityDate,
          exerciseType: dto.exerciseType,
          durationMinutes: dto.durationMinutes,
          distanceKm: dto.distanceKm,
          avgHeartRate: dto.avgHeartRate,
          heartRateMinutes: dto.heartRateMinutes ?? null,
          hasHeartRateProof,
          notes: dto.notes,
          photos: {
            create: dto.photos.map((p) => ({
              url: p.url,
              cloudinaryId: p.cloudinaryId,
              type: p.type,
            })),
          },
        },
        include: { photos: true },
      });
      return this.withCompliance(created, challenge);
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('Ya registraste una actividad para ese día');
      }
      throw e;
    }
  }

  async findAll(filter: QueryActivitiesDto) {
    const where: Prisma.DailyActivityWhereInput = {};
    if (filter.challengeId) where.challengeId = filter.challengeId;
    if (filter.userId) where.userId = filter.userId;
    if (filter.status) where.status = filter.status;

    const activities = await this.prisma.dailyActivity.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
        photos: true,
        challenge: { select: { minHeartRateMinutes: true } },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
    return activities.map((a) => this.withCompliance(a));
  }

  findMine(userId: string, challengeId?: string) {
    return this.findAll({ userId, challengeId });
  }

  findPending(challengeId?: string) {
    return this.findAll({ challengeId, status: ActivityStatus.PENDING });
  }

  async findOne(id: string) {
    const activity = await this.prisma.dailyActivity.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        photos: true,
        challenge: true,
      },
    });
    if (!activity) throw new NotFoundException('Actividad no encontrada');
    return this.withCompliance(activity);
  }

  async validate(id: string, validatorId: string, dto: ValidateActivityDto = {}) {
    const activity = await this.findOne(id);
    if (activity.status === ActivityStatus.VALIDATED) return activity;

    const assessment = assessHeartRate(activity.challenge, activity);
    const hasOverride = dto.override === true && !!dto.note;
    if (!assessment.compliant && !hasOverride) {
      throw new BadRequestException(
        `La actividad no cumple la regla de FC del reto: ${assessment.reasons.join('. ')}. ` +
          'Para validarla de todas formas envía override=true con una nota.',
      );
    }

    const updated = await this.prisma.dailyActivity.update({
      where: { id },
      data: {
        status: ActivityStatus.VALIDATED,
        validatedById: validatorId,
        validatedAt: new Date(),
        rejectionReason: null,
        validationNote: dto.note ?? null,
      },
      include: {
        photos: true,
        user: { select: { id: true, name: true, email: true } },
        challenge: { select: { minHeartRateMinutes: true } },
      },
    });
    return this.withCompliance(updated);
  }

  async reject(id: string, validatorId: string, reason: string) {
    await this.findOne(id);
    const updated = await this.prisma.dailyActivity.update({
      where: { id },
      data: {
        status: ActivityStatus.REJECTED,
        validatedById: validatorId,
        validatedAt: new Date(),
        rejectionReason: reason,
      },
      include: {
        photos: true,
        user: { select: { id: true, name: true, email: true } },
        challenge: { select: { minHeartRateMinutes: true } },
      },
    });
    return this.withCompliance(updated);
  }

  async remove(id: string, userId: string, role: UserRole) {
    const activity = await this.findOne(id);
    if (role !== UserRole.ADMIN && activity.userId !== userId) {
      throw new ForbiddenException('No puedes eliminar esta actividad');
    }
    if (role !== UserRole.ADMIN && activity.status !== ActivityStatus.PENDING) {
      throw new ForbiddenException(
        'Solo se pueden eliminar actividades pendientes',
      );
    }
    await this.prisma.dailyActivity.delete({ where: { id } });
  }
}
