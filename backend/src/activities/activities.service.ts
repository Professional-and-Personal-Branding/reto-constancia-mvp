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
  Prisma,
  UserRole,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { ChallengesService } from '../challenges/challenges.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { QueryActivitiesDto } from './dto/query-activities.dto';

@Injectable()
export class ActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly challenges: ChallengesService,
  ) {}

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

    try {
      return await this.prisma.dailyActivity.create({
        data: {
          challengeId: dto.challengeId,
          userId,
          date: activityDate,
          exerciseType: dto.exerciseType,
          durationMinutes: dto.durationMinutes,
          distanceKm: dto.distanceKm,
          avgHeartRate: dto.avgHeartRate,
          hasHeartRateProof: dto.hasHeartRateProof ?? false,
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

  findAll(filter: QueryActivitiesDto) {
    const where: Prisma.DailyActivityWhereInput = {};
    if (filter.challengeId) where.challengeId = filter.challengeId;
    if (filter.userId) where.userId = filter.userId;
    if (filter.status) where.status = filter.status;

    return this.prisma.dailyActivity.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
        photos: true,
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
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
    return activity;
  }

  async validate(id: string, validatorId: string) {
    const activity = await this.findOne(id);
    if (activity.status === ActivityStatus.VALIDATED) return activity;
    return this.prisma.dailyActivity.update({
      where: { id },
      data: {
        status: ActivityStatus.VALIDATED,
        validatedById: validatorId,
        validatedAt: new Date(),
        rejectionReason: null,
      },
      include: { photos: true, user: { select: { id: true, name: true, email: true } } },
    });
  }

  async reject(id: string, validatorId: string, reason: string) {
    await this.findOne(id);
    return this.prisma.dailyActivity.update({
      where: { id },
      data: {
        status: ActivityStatus.REJECTED,
        validatedById: validatorId,
        validatedAt: new Date(),
        rejectionReason: reason,
      },
      include: { photos: true, user: { select: { id: true, name: true, email: true } } },
    });
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
