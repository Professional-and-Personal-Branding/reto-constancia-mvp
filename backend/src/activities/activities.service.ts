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
import { isLockTimeout, lockChallenge, withChallengeLock } from '../challenges/challenge-lock';
import { UploadService } from '../upload/upload.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { QueryActivitiesDto } from './dto/query-activities.dto';
import { PendingOrder, QueryPendingDto } from './dto/query-pending.dto';
import { ResubmitActivityDto } from './dto/resubmit-activity.dto';
import { ValidateActivityDto } from './dto/validate-activity.dto';
import { buildCalendar, MyCalendar } from './calendar';
import {
  assessHeartRate,
  HeartRateAssessment,
  HeartRateInput,
  HeartRateRule,
} from './heart-rate-rule';

export const CLOSED_ACTIVITIES_MESSAGE = 'El reto está cerrado; sus actividades son definitivas';

export const ACTIVITY_LOCK_MESSAGE =
  'La actividad se está modificando; vuelve a intentarlo en unos segundos';
export const ONLY_PENDING_REJECTABLE_MESSAGE = 'Solo se pueden rechazar actividades pendientes';
export const ONLY_REJECTED_RESUBMITTABLE_MESSAGE = 'Solo se pueden reenviar actividades rechazadas';

/** Historial de rechazos que ve el dueño o un admin: motivo y hora, nunca quién rechazó (design D8). */
const REJECTIONS_INCLUDE = {
  select: { reason: true, rejectedAt: true },
  orderBy: { rejectedAt: 'asc' },
} satisfies Prisma.DailyActivity$rejectionsArgs;

const ACTIVITY_DETAIL_INCLUDE = {
  user: { select: { id: true, name: true, email: true } },
  photos: true,
  challenge: true,
} satisfies Prisma.DailyActivityInclude;

/**
 * Reglas de los datos de una actividad que comparten el registro y el reenvío (design D5):
 * minutos con FC no mayores que la duración y regla de FC vigente del reto con la prueba derivada
 * de las fotos. Pura: lanza 400 con los mismos mensajes al registrar y al reenviar.
 */
export function checkActivityFields(
  rule: HeartRateRule,
  fields: { durationMinutes: number; heartRateMinutes?: number | null },
  hasHeartRateProof: boolean,
): void {
  if (
    fields.heartRateMinutes !== undefined &&
    fields.heartRateMinutes !== null &&
    fields.heartRateMinutes > fields.durationMinutes
  ) {
    throw new BadRequestException('Los minutos con FC no pueden superar la duración de la actividad');
  }
  const assessment = assessHeartRate(rule, {
    heartRateMinutes: fields.heartRateMinutes ?? null,
    hasHeartRateProof,
  });
  if (!assessment.compliant) {
    throw new BadRequestException(assessment.reasons.join('. '));
  }
}

/** La prueba de FC se deriva de las fotos, no del flag del cliente. */
function hasHeartRatePhoto(photos: { type?: PhotoType | null }[]): boolean {
  return photos.some((p) => (p.type ?? PhotoType.ACTIVITY) === PhotoType.HEART_RATE);
}

@Injectable()
export class ActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly challenges: ChallengesService,
    private readonly uploads: UploadService,
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
    const challenge = await this.challenges.assertActiveParticipant(dto.challengeId, userId);

    // Cada foto (actividad, FC o métricas) debe ser un archivo propio subido al reto
    // (spec upload-guardrails). La importación del admin no pasa por aquí.
    const ids = dto.photos.map((p) => p.cloudinaryId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('La misma foto no puede adjuntarse dos veces');
    }
    for (const photo of dto.photos) {
      this.uploads.assertOwnedAsset(
        { url: photo.url, publicId: photo.cloudinaryId },
        { challengeId: dto.challengeId, userId, purpose: 'activity' },
      );
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
    const hasHeartRateProof = hasHeartRatePhoto(dto.photos);
    checkActivityFields(challenge, dto, hasHeartRateProof);

    try {
      // Bajo el lock del reto (spec challenge-lifecycle): nunca se crea una actividad después
      // de que el reto se cerró, aunque el chequeo de arriba haya leído ACTIVE.
      return await withChallengeLock(this.prisma, async (tx) => {
        const locked = await lockChallenge(tx, dto.challengeId);
        if (locked.status !== ChallengeStatus.ACTIVE) {
          throw new BadRequestException('El reto no está activo');
        }
        const created = await tx.dailyActivity.create({
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

  async findAll(filter: QueryActivitiesDto, order: PendingOrder = 'desc') {
    const where: Prisma.DailyActivityWhereInput = {};
    if (filter.challengeId) where.challengeId = filter.challengeId;
    if (filter.userId) where.userId = filter.userId;
    if (filter.status) where.status = filter.status;

    const activities = await this.prisma.dailyActivity.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
        photos: true,
        challenge: { select: { minHeartRateMinutes: true, name: true, status: true } },
        rejections: REJECTIONS_INCLUDE,
      },
      orderBy: [{ date: order }, { createdAt: order }],
    });
    return activities.map((a) => this.withCompliance(a));
  }

  findMine(userId: string, challengeId?: string) {
    return this.findAll({ userId, challengeId });
  }

  /**
   * Calendario propio del reto (spec participant-calendar): solo lectura, cualquier estado del
   * reto, solo las actividades del usuario del JWT y sin fotos. La validez de cada día sale de las
   * mismas reglas que usa `create`.
   */
  async myCalendar(userId: string, challengeId: string): Promise<MyCalendar & { challengeId: string }> {
    const challenge = await this.prisma.challenge.findUnique({ where: { id: challengeId } });
    if (!challenge) throw new NotFoundException('Reto no encontrado');
    await this.challenges.assertEnrolled(challengeId, userId);
    const activities = await this.prisma.dailyActivity.findMany({
      where: { challengeId, userId },
      select: {
        id: true,
        date: true,
        status: true,
        exerciseType: true,
        durationMinutes: true,
        distanceKm: true,
        heartRateMinutes: true,
        hasHeartRateProof: true,
        rejectionReason: true,
      },
      orderBy: { date: 'asc' },
    });
    return { challengeId, ...buildCalendar(challenge, activities, this.challenges) };
  }

  /** Cola de validación: la más antigua primero salvo `order: 'desc'` (spec challenge-lifecycle). */
  findPending(query: QueryPendingDto = {}) {
    return this.findAll({ challengeId: query.challengeId, status: ActivityStatus.PENDING }, query.order ?? 'asc');
  }

  /** Pendientes de retos activos, para el contador del menú del admin. */
  async countPending() {
    const count = await this.prisma.dailyActivity.count({
      where: { status: ActivityStatus.PENDING, challenge: { status: ChallengeStatus.ACTIVE } },
    });
    return { count };
  }

  async findOne(id: string) {
    const activity = await this.prisma.dailyActivity.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        photos: true,
        challenge: true,
        rejections: REJECTIONS_INCLUDE,
      },
    });
    if (!activity) throw new NotFoundException('Actividad no encontrada');
    return this.withCompliance(activity);
  }

  /** Detalle para quien consulta: solo el dueño o un admin (spec challenge-lifecycle). */
  async findOneForViewer(id: string, userId: string, role: UserRole) {
    const activity = await this.findOne(id);
    if (role !== UserRole.ADMIN && activity.userId !== userId) {
      throw new ForbiddenException('No puedes ver esta actividad');
    }
    return activity;
  }

  /**
   * Bloquea el reto de la actividad, rechaza si está cerrado (antes que cualquier chequeo de rol
   * o propiedad), bloquea la fila de la actividad y la relee para decidir con datos frescos
   * (design D4). El orden de locks es siempre reto y luego actividad. Si la fila no se puede
   * bloquear a tiempo responde 409 con su propio mensaje, distinto del del cierre del reto.
   */
  private async lockOpenActivity(tx: Prisma.TransactionClient, id: string, challengeId: string) {
    const locked = await lockChallenge(tx, challengeId);
    if (locked.status === ChallengeStatus.COMPLETED) {
      throw new BadRequestException(CLOSED_ACTIVITIES_MESSAGE);
    }
    try {
      await tx.$queryRaw`SELECT id FROM "DailyActivity" WHERE id = ${id} FOR UPDATE`;
    } catch (e) {
      if (isLockTimeout(e)) throw new ConflictException(ACTIVITY_LOCK_MESSAGE);
      throw e;
    }
    const fresh = await tx.dailyActivity.findUnique({ where: { id }, include: ACTIVITY_DETAIL_INCLUDE });
    if (!fresh) throw new NotFoundException('Actividad no encontrada');
    return fresh;
  }

  async validate(id: string, validatorId: string, dto: ValidateActivityDto = {}) {
    const { challengeId } = await this.findOne(id);
    return withChallengeLock(this.prisma, async (tx) => {
      const activity = await this.lockOpenActivity(tx, id, challengeId);
      if (activity.status === ActivityStatus.VALIDATED) return this.withCompliance(activity);

      const assessment = assessHeartRate(activity.challenge, activity);
      const hasOverride = dto.override === true && !!dto.note;
      if (!assessment.compliant && !hasOverride) {
        throw new BadRequestException(
          `La actividad no cumple la regla de FC del reto: ${assessment.reasons.join('. ')}. ` +
            'Para validarla de todas formas envía override=true con una nota.',
        );
      }

      const updated = await tx.dailyActivity.update({
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
          rejections: REJECTIONS_INCLUDE,
        },
      });
      return this.withCompliance(updated);
    });
  }

  async reject(id: string, validatorId: string, reason: string) {
    const { challengeId } = await this.findOne(id);
    return withChallengeLock(this.prisma, async (tx) => {
      const activity = await this.lockOpenActivity(tx, id, challengeId);
      // Solo se rechaza lo pendiente, releído bajo el lock (design D12); el cierre ya respondió 400
      if (activity.status !== ActivityStatus.PENDING) {
        throw new ConflictException(ONLY_PENDING_REJECTABLE_MESSAGE);
      }
      // El historial se escribe en la misma transacción que el cambio de estado
      const updated = await tx.dailyActivity.update({
        where: { id },
        data: {
          status: ActivityStatus.REJECTED,
          validatedById: validatorId,
          validatedAt: new Date(),
          rejectionReason: reason,
          rejections: { create: { reason, rejectedById: validatorId } },
        },
        include: {
          photos: true,
          user: { select: { id: true, name: true, email: true } },
          challenge: { select: { minHeartRateMinutes: true } },
          rejections: REJECTIONS_INCLUDE,
        },
      });
      return this.withCompliance(updated);
    });
  }

  /**
   * El dueño corrige y reenvía su actividad rechazada (design D5/D7). Todo se decide con la
   * actividad y el reto releídos bajo los locks; las fotos quitadas se liberan después del commit.
   */
  async resubmit(id: string, userId: string, dto: ResubmitActivityDto) {
    const { challengeId } = await this.findOne(id);
    let dropped: string[] = [];
    const result = await withChallengeLock(this.prisma, async (tx) => {
      const activity = await this.lockOpenActivity(tx, id, challengeId);
      const challenge = activity.challenge;
      if (challenge.status !== ChallengeStatus.ACTIVE) {
        throw new BadRequestException('El reto no está activo');
      }
      if (activity.userId !== userId) {
        throw new ForbiddenException('No puedes reenviar esta actividad');
      }
      if (activity.status !== ActivityStatus.REJECTED) {
        throw new ForbiddenException(ONLY_REJECTED_RESUBMITTABLE_MESSAGE);
      }
      const participation = await tx.challengeParticipant.findUnique({
        where: { challengeId_userId: { challengeId, userId } },
      });
      if (!participation) throw new ForbiddenException('No participas en este reto');

      // Fotos: la lista del cuerpo es la final. Una igual (id y url) a una guardada se conserva sin
      // revisar su subida; cualquier otra debe ser una subida propia del participante a este reto.
      const ids = dto.photos.map((p) => p.cloudinaryId);
      if (new Set(ids).size !== ids.length) {
        throw new BadRequestException('La misma foto no puede adjuntarse dos veces');
      }
      const stored = activity.photos;
      const keptIds = new Set<string>();
      const retag: { id: string; type: PhotoType }[] = [];
      const added: { url: string; cloudinaryId: string; type: PhotoType }[] = [];
      for (const photo of dto.photos) {
        const type = photo.type ?? PhotoType.ACTIVITY;
        const same = stored.find((s) => s.cloudinaryId === photo.cloudinaryId && s.url === photo.url);
        if (same) {
          keptIds.add(same.id);
          if (same.type !== type) retag.push({ id: same.id, type });
        } else {
          this.uploads.assertOwnedAsset(
            { url: photo.url, publicId: photo.cloudinaryId },
            { challengeId, userId, purpose: 'activity' },
          );
          added.push({ url: photo.url, cloudinaryId: photo.cloudinaryId, type });
        }
      }
      const removed = stored.filter((s) => !keptIds.has(s.id));

      // La fecha guardada debe seguir siendo válida con las reglas vigentes del reto
      if (!this.challenges.isWithinPeriod(challenge, activity.date)) {
        throw new BadRequestException('La fecha está fuera del período del reto');
      }
      if (!this.challenges.isValidDay(challenge, activity.date)) {
        throw new BadRequestException('Ese día de la semana no es válido para este reto');
      }
      const hasHeartRateProof = hasHeartRatePhoto(dto.photos);
      checkActivityFields(challenge, dto, hasHeartRateProof);

      const updated = await tx.dailyActivity.update({
        where: { id },
        data: {
          exerciseType: dto.exerciseType,
          durationMinutes: dto.durationMinutes,
          distanceKm: dto.distanceKm ?? null,
          avgHeartRate: dto.avgHeartRate ?? null,
          heartRateMinutes: dto.heartRateMinutes ?? null,
          notes: dto.notes ?? null,
          hasHeartRateProof,
          status: ActivityStatus.PENDING,
          rejectionReason: null,
          validatedById: null,
          validatedAt: null,
          validationNote: null,
          resubmissionCount: { increment: 1 },
          photos: {
            deleteMany: removed.length ? { id: { in: removed.map((r) => r.id) } } : undefined,
            update: retag.map((r) => ({ where: { id: r.id }, data: { type: r.type } })),
            create: added,
          },
        },
        include: {
          photos: true,
          user: { select: { id: true, name: true, email: true } },
          challenge: { select: { minHeartRateMinutes: true, name: true, status: true } },
          rejections: REJECTIONS_INCLUDE,
        },
      });
      dropped = removed.map((r) => r.cloudinaryId);
      return this.withCompliance(updated);
    });
    // Después del commit y sin esperar: libera las fotos quitadas que ya nadie usa
    void this.uploads.deleteAssetsLater(dropped);
    return result;
  }

  async remove(id: string, userId: string, role: UserRole) {
    const { challengeId } = await this.findOne(id);
    const photoIds = await withChallengeLock(this.prisma, async (tx) => {
      // El reto cerrado va primero: nadie borra actividades de un reto definitivo
      const activity = await this.lockOpenActivity(tx, id, challengeId);
      if (role !== UserRole.ADMIN && activity.userId !== userId) {
        throw new ForbiddenException('No puedes eliminar esta actividad');
      }
      // Una rechazada no suma nada: el dueño la retira para registrar ese día de nuevo
      if (
        role !== UserRole.ADMIN &&
        activity.status !== ActivityStatus.PENDING &&
        activity.status !== ActivityStatus.REJECTED
      ) {
        throw new ForbiddenException(
          'Solo se pueden eliminar actividades pendientes o rechazadas',
        );
      }
      await tx.dailyActivity.delete({ where: { id } });
      return activity.photos.map((p) => p.cloudinaryId);
    });
    // Después del commit y sin esperar: libera las fotos que ya nadie usa (spec activity-withdrawal)
    void this.uploads.deleteAssetsLater(photoIds);
  }
}
