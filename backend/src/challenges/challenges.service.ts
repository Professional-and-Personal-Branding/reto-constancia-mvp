import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ActivityStatus, Challenge, ChallengeStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CreateChallengeDto } from './dto/create-challenge.dto';
import { UpdateChallengeDto } from './dto/update-challenge.dto';
import { MarkPaymentDto } from './dto/mark-payment.dto';
import { PaymentProofDto } from './dto/payment-proof.dto';
import { UploadService } from '../upload/upload.service';
import { CLOSER_TX, LockMode, lockChallenge, withChallengeLock } from './challenge-lock';
import { ResultsService } from './results.service';
import type { ParticipantRanking } from './results.service';
import { computeFinance, computePayout, PaymentState, ChallengePayout, proofToReview, toMoney } from './finance.service';
import { AUTO_DRAW_NOTE } from './scoring';
import { buildChallengeCsv, ExportParticipant, exportFilename } from './challenge-export';

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

const CLOSED_MESSAGE = 'No se puede modificar un reto cerrado';

/** Lo que implica cerrar un reto activo (spec challenge-lifecycle: close preview). */
export interface ClosePreview {
  challengeId: string;
  challengeName: string;
  currency: string;
  feePerParticipant: number;
  pendingActivities: { count: number; items: { id: string; userId: string; userName: string; date: Date }[] };
  proofsToReview: { userId: string; name: string; paymentProofUploadedAt: Date | null }[];
  unpaid: { userId: string; name: string; state: Exclude<PaymentState, 'paid'>; amountPaid: number }[];
  drawNeeded: boolean;
  guaranteedWinners: PreviewWinner[];
  drawCandidates: PreviewWinner[];
  drawSeats: number;
  /** Proyección: el cierre vuelve a calcular bajo su propio lock */
  payout: ChallengePayout;
}

export interface PreviewWinner {
  userId: string;
  name: string;
  score: number;
  totalKm: number;
}

const PENDING_PREVIEW_LIMIT = 50;

function previewWinner(r: ParticipantRanking): PreviewWinner {
  return { userId: r.userId, name: r.name, score: r.score, totalKm: r.totalKm };
}

/** Pedir de nuevo el cierre (solo `status: COMPLETED`, el resto sin definir) no cambia nada. */
function onlyClosing(dto: UpdateChallengeDto): boolean {
  return Object.entries(dto).every(
    ([key, value]) => value === undefined || (key === 'status' && value === ChallengeStatus.COMPLETED),
  );
}

@Injectable()
export class ChallengesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadService,
    private readonly results: ResultsService,
  ) {}

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
    return withChallengeLock(this.prisma, async (tx) => {
      const locked = await lockChallenge(tx, id, 'update');
      if (locked.status === ChallengeStatus.COMPLETED) {
        throw new BadRequestException('Un reto cerrado no puede reactivarse');
      }
      return tx.challenge.update({ where: { id }, data: { status: ChallengeStatus.ACTIVE } });
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
      if (onlyClosing(dto)) return current;
      throw new BadRequestException(CLOSED_MESSAGE);
    }
    // Cerrar pasa siempre por el mismo paso (spec challenge-lifecycle), sin mezclar otros cambios
    if (dto.status === ChallengeStatus.COMPLETED) {
      if (!onlyClosing(dto)) {
        throw new BadRequestException('Para cerrar el reto envía solo el estado');
      }
      return this.close(id);
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
    // Bajo lock exclusivo: un cambio de reglas que leyó ACTIVE no puede caer después del cierre
    // (spec challenge-lifecycle). Si otro cierre ganó la carrera, pedir el cierre sigue siendo
    // idempotente y cualquier otro cambio se rechaza.
    return withChallengeLock(this.prisma, async (tx) => {
      const locked = await lockChallenge(tx, id, 'update');
      if (locked.status === ChallengeStatus.COMPLETED) {
        if (onlyClosing(dto)) return tx.challenge.findUniqueOrThrow({ where: { id } });
        throw new BadRequestException(CLOSED_MESSAGE);
      }
      return tx.challenge.update({ where: { id }, data });
    });
  }

  /**
   * Corre una escritura que depende del estado del reto bajo su lock y la rechaza si el reto
   * ya está cerrado (spec challenge-lifecycle: writes serialized with closing).
   */
  private writeWhileOpen<T>(
    challengeId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    mode: LockMode = 'share',
  ): Promise<T> {
    return withChallengeLock(this.prisma, async (tx) => {
      const locked = await lockChallenge(tx, challengeId, mode);
      if (locked.status === ChallengeStatus.COMPLETED) throw new BadRequestException(CLOSED_MESSAGE);
      return fn(tx);
    });
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
      return await this.writeWhileOpen(challengeId, (tx) =>
        tx.challengeParticipant.create({
          data: { challengeId, userId },
          include: { user: { select: { id: true, name: true, email: true } } },
        }),
      );
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
    await this.writeWhileOpen(challengeId, (tx) =>
      tx.challengeParticipant.delete({
        where: { challengeId_userId: { challengeId, userId } },
      }),
    );
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
    return this.writeWhileOpen(challengeId, (tx) => tx.challengeParticipant.update({
      where: { challengeId_userId: { challengeId, userId } },
      data: {
        paid: dto.paid,
        paidAt: dto.paid ? new Date() : null,
        // El comprobante no se toca: lo sube el participante (spec challenge-finance)
        amountPaid,
      },
      include: { user: { select: { id: true, name: true, email: true } } },
    }));
  }

  async uploadPaymentProof(
    challengeId: string,
    userId: string,
    dto: PaymentProofDto,
  ) {
    await this.assertPaymentParticipant(challengeId, userId);
    this.uploads.assertOwnedAsset(
      { url: dto.paymentProofUrl, publicId: dto.paymentProofCloudinaryId },
      { challengeId, userId, purpose: 'payment-proof' },
    );
    const { updated, previousId } = await this.writeWhileOpen(challengeId, async (tx) => {
      const previous = await tx.challengeParticipant.findUnique({
        where: { challengeId_userId: { challengeId, userId } },
        select: { paymentProofCloudinaryId: true },
      });
      const saved = await tx.challengeParticipant.update({
        where: { challengeId_userId: { challengeId, userId } },
        data: {
          paymentProofUrl: dto.paymentProofUrl,
          paymentProofCloudinaryId: dto.paymentProofCloudinaryId,
          paymentProofUploadedAt: new Date(),
        },
        include: { user: { select: { id: true, name: true, email: true } } },
      });
      return { updated: saved, previousId: previous?.paymentProofCloudinaryId ?? null };
    });
    // El comprobante anterior es evidencia financiera: se conserva salvo que se active el
    // borrado (spec challenge-finance). Se libera después del commit y sin esperar.
    if (this.uploads.deleteReplacedProofs && previousId && previousId !== dto.paymentProofCloudinaryId) {
      void this.uploads.deleteAssetsLater([previousId]);
    }
    return updated;
  }

  /**
   * Para registrar actividad o firmar sus fotos: el reto existe, está activo y el usuario
   * participa. Mismos mensajes y orden que tenía la creación de actividades.
   */
  async assertActiveParticipant(challengeId: string, userId: string) {
    const challenge = await this.prisma.challenge.findUnique({ where: { id: challengeId } });
    if (!challenge) throw new NotFoundException('Reto no encontrado');
    if (challenge.status !== ChallengeStatus.ACTIVE) {
      throw new BadRequestException('El reto no está activo');
    }
    await this.assertEnrolled(challengeId, userId);
    return challenge;
  }

  /** Para subir un comprobante: el reto no está cerrado y el usuario participa. */
  async assertPaymentParticipant(challengeId: string, userId: string) {
    const challenge = await this.openForPayments(challengeId);
    await this.assertEnrolled(challengeId, userId);
    return challenge;
  }

  private async assertEnrolled(challengeId: string, userId: string) {
    const participation = await this.prisma.challengeParticipant.findUnique({
      where: { challengeId_userId: { challengeId, userId } },
    });
    if (!participation) throw new ForbiddenException('No participas en este reto');
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

  /**
   * Resumen de solo lectura antes de cerrar (spec challenge-lifecycle): pendientes que no
   * contarán, comprobantes sin pago registrado, impagos y la proyección de ganadores y reparto.
   * No toma locks ni escribe: el cierre vuelve a calcular todo bajo el suyo.
   */
  /**
   * Acta del reto cerrado en CSV (spec challenge-export). Solo lee: ranking y premiación
   * guardada de los resultados, estado de pago de las finanzas, ambos del mismo reto.
   */
  async exportCsv(id: string): Promise<{ filename: string; content: string }> {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id },
      include: {
        participants: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    });
    if (!challenge) throw new NotFoundException('Reto no encontrado');
    if (challenge.status !== ChallengeStatus.COMPLETED) {
      throw new BadRequestException('Solo se puede exportar el acta de un reto cerrado');
    }

    const results = await this.results.getResults(id);
    const finance = computeFinance(challenge, challenge.participants);
    const payments = new Map(finance.participants.map((p) => [p.userId, p]));
    const awards = new Map(results.awards.map((a) => [a.userId, a]));

    const participants: ExportParticipant[] = results.ranking.map((r) => {
      const payment = payments.get(r.userId);
      const award = awards.get(r.userId);
      return {
        name: r.name,
        email: r.email,
        validatedDays: r.validatedDays,
        pendingDays: r.pendingDays,
        rejectedDays: r.rejectedDays,
        totalKm: r.totalKm,
        score: r.score,
        qualified: r.qualified,
        paymentState: payment?.state ?? 'unpaid',
        amountPaid: payment?.amountPaid ?? 0,
        paidAt: payment?.paidAt ?? null,
        winner: !!award,
        awardNote: award?.notes ?? null,
        prize: award && results.payout.monetary ? results.payout.perWinner : null,
      };
    });

    return {
      filename: exportFilename(challenge.year, challenge.month),
      content: buildChallengeCsv(
        {
          name: challenge.name,
          year: challenge.year,
          month: challenge.month,
          currency: challenge.currency,
          fee: finance.feePerParticipant,
          pot: results.payout.pot,
        },
        participants,
      ),
    };
  }

  async closePreview(id: string): Promise<ClosePreview> {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id },
      include: {
        participants: {
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });
    if (!challenge) throw new NotFoundException('Reto no encontrado');
    if (challenge.status === ChallengeStatus.DRAFT) {
      throw new BadRequestException('Solo se puede cerrar un reto activo');
    }
    if (challenge.status === ChallengeStatus.COMPLETED) {
      throw new BadRequestException('El reto ya está cerrado');
    }

    const pendingWhere = { challengeId: id, status: ActivityStatus.PENDING };
    const [pendingCount, pendingItems, preview] = await Promise.all([
      this.prisma.dailyActivity.count({ where: pendingWhere }),
      this.prisma.dailyActivity.findMany({
        where: pendingWhere,
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
        take: PENDING_PREVIEW_LIMIT,
        select: { id: true, date: true, userId: true, user: { select: { name: true } } },
      }),
      this.results.previewSelection(id),
    ]);

    const finance = computeFinance(challenge, challenge.participants);
    const { selection } = preview;
    const drawSeats = selection.drawSeats ?? 0;

    return {
      challengeId: challenge.id,
      challengeName: challenge.name,
      currency: finance.currency,
      feePerParticipant: finance.feePerParticipant,
      pendingActivities: {
        count: pendingCount,
        items: pendingItems.map((a) => ({ id: a.id, userId: a.userId, userName: a.user.name, date: a.date })),
      },
      proofsToReview: challenge.participants
        .filter((p) =>
          proofToReview(
            toMoney(challenge.feePerParticipant),
            p.paid,
            p.paid ? toMoney(p.amountPaid) : 0,
            p.paidAt,
            p.paymentProofUrl,
            p.paymentProofUploadedAt,
          ),
        )
        .map((p) => ({ userId: p.userId, name: p.user.name, paymentProofUploadedAt: p.paymentProofUploadedAt })),
      unpaid: finance.participants
        .filter((p) => p.state !== 'paid')
        .map((p) => ({
          userId: p.userId,
          name: p.name,
          state: p.state as Exclude<PaymentState, 'paid'>,
          amountPaid: p.amountPaid,
        })),
      drawNeeded: selection.drawNeeded,
      guaranteedWinners: selection.guaranteed.map(previewWinner),
      drawCandidates: (selection.drawPool ?? []).map(previewWinner),
      drawSeats,
      payout: computePayout(preview.collected, selection.guaranteed.length + drawSeats, challenge.feePerParticipant),
    };
  }

  /** Cierra un reto activo (idempotente si ya está cerrado) por el paso común de cierre. */
  async close(id: string): Promise<Challenge> {
    await this.findOne(id); // 404 legible antes de tomar el lock
    await this.closeTx(id);
    return this.prisma.challenge.findUniqueOrThrow({ where: { id } });
  }

  /**
   * Único paso de cierre (spec challenge-lifecycle y challenge-scoring). Toma el lock exclusivo
   * del reto, así espera a las escrituras en curso y bloquea las nuevas:
   * - DRAFT: 400; solo se cierra un reto activo.
   * - Sin premiación manual: cierra un ACTIVE y, si los resultados (calculados dentro de la
   *   transacción) necesitan sorteo, lo hace una sola vez y guarda a todos los ganadores como
   *   awards con la nota reservada. Un COMPLETED se devuelve tal cual (idempotente).
   * - Con premiación manual: valida a los premiados bajo el lock, cierra si estaba activo y
   *   reemplaza las awards (también las del sorteo automático).
   */
  private async closeTx(id: string, manual?: { userIds: string[]; notes?: string }): Promise<void> {
    await withChallengeLock(
      this.prisma,
      async (tx) => {
        const locked = await lockChallenge(tx, id, 'update', CLOSER_TX.lockTimeoutMs);
        if (locked.status === ChallengeStatus.DRAFT) {
          throw new BadRequestException('Solo se puede cerrar un reto activo');
        }

        if (manual) {
          const enrolled = await tx.challengeParticipant.findMany({
            where: { challengeId: id },
            select: { userId: true },
          });
          const participantIds = new Set(enrolled.map((p) => p.userId));
          if (manual.userIds.some((userId) => !participantIds.has(userId))) {
            throw new BadRequestException('Solo se puede premiar a participantes del reto');
          }
          if (locked.status === ChallengeStatus.ACTIVE) {
            await tx.challenge.update({ where: { id }, data: { status: ChallengeStatus.COMPLETED } });
          }
          await tx.challengeAward.deleteMany({ where: { challengeId: id } });
          await tx.challengeAward.createMany({
            data: manual.userIds.map((userId) => ({ challengeId: id, userId, notes: manual.notes })),
          });
          return;
        }

        if (locked.status === ChallengeStatus.COMPLETED) return;
        await tx.challenge.update({ where: { id }, data: { status: ChallengeStatus.COMPLETED } });
        const results = await this.results.computeResults(tx, id);
        if (results.drawNeeded && results.awards.length === 0) {
          // winners ya incluye a los asegurados del desempate por km
          await tx.challengeAward.createMany({
            data: results.winners.map((w) => ({ challengeId: id, userId: w.userId, notes: AUTO_DRAW_NOTE })),
          });
        }
      },
      CLOSER_TX,
    );
  }

  async award(challengeId: string, userIds: string[], notes?: string) {
    await this.findOne(challengeId); // 404 legible antes de tomar el lock
    await this.closeTx(challengeId, { userIds, notes });

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
