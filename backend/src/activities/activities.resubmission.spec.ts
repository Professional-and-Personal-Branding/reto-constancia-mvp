import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ActivityStatus, ChallengeStatus, ExerciseType, PhotoType, Prisma, UserRole } from '@prisma/client';

import { ACTIVITY_LOCK_MESSAGE, ActivitiesService, checkActivityFields } from './activities.service';
import { ResubmitActivityDto } from './dto/resubmit-activity.dto';
import { LOCK_CONFLICT_MESSAGE } from '../challenges/challenge-lock';
import { ChallengesService } from '../challenges/challenges.service';
import { ResultsService } from '../challenges/results.service';
import { PrismaService } from '../prisma/prisma.service';
import { localUploads, ownedAsset } from '../../test/helpers/assets';
import { withLocks } from '../../test/helpers/prisma-lock';

/*
 * Reenvío de una actividad rechazada, historial de rechazos y lock de la fila
 * (cambio resubmit-rejected-activity-2). Unitarias con Prisma simulado: las carreras reales con
 * Postgres están en platform-rules.e2e-spec.ts.
 */

const challenge = {
  id: 'c1',
  status: ChallengeStatus.ACTIVE,
  startDate: new Date('2026-05-01T00:00:00Z'),
  endDate: new Date('2026-05-31T23:59:59Z'),
  validDays: [0, 1, 2, 3, 4, 5, 6],
  minHeartRateMinutes: 20,
};

const own = (name: string) => ownedAsset({ challengeId: 'c1', userId: 'u1', name });
const storedActivity = { id: 'ph1', ...own('a'), type: PhotoType.ACTIVITY };
const storedOther = { id: 'ph2', ...own('b'), type: PhotoType.ACTIVITY };
const newActivity = { ...own('nueva'), type: PhotoType.ACTIVITY };
const newHr = { ...own('fc'), type: PhotoType.HEART_RATE };
const keptActivity = { url: storedActivity.url, cloudinaryId: storedActivity.cloudinaryId, type: PhotoType.ACTIVITY };

const rejected = {
  id: 'act1',
  challengeId: 'c1',
  userId: 'u1',
  date: new Date('2026-05-06T00:00:00Z'), // miércoles
  status: ActivityStatus.REJECTED,
  rejectionReason: 'Falta la captura de FC',
  resubmissionCount: 0,
  heartRateMinutes: null,
  hasHeartRateProof: false,
  challenge,
  photos: [storedActivity],
};

function body(over: Partial<ResubmitActivityDto> = {}): ResubmitActivityDto {
  return {
    exerciseType: ExerciseType.RUNNING,
    durationMinutes: 30,
    heartRateMinutes: 25,
    photos: [keptActivity, newHr],
    ...over,
  } as ResubmitActivityDto;
}

function build(activity: Record<string, unknown> = rejected, ch: Record<string, unknown> = challenge) {
  const update = jest.fn(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ ...activity, ...data, photos: [], rejections: [] }),
  );
  const findUnique = jest.fn().mockResolvedValue({ ...activity, challenge: ch });
  const participant = jest.fn().mockResolvedValue({ id: 'p1' });
  const prisma = withLocks({
    challenge: { findUnique: jest.fn().mockResolvedValue(ch) },
    challengeParticipant: { findUnique: participant },
    dailyActivity: { update, findUnique, findMany: jest.fn() },
  } as unknown as PrismaService);
  const uploads = localUploads();
  const later = jest.spyOn(uploads, 'deleteAssetsLater').mockResolvedValue(undefined);
  const owned = jest.spyOn(uploads, 'assertOwnedAsset');
  const svc = new ActivitiesService(
    prisma,
    new ChallengesService(prisma, uploads, new ResultsService(prisma)),
    uploads,
  );
  const raw = (prisma as unknown as { $queryRaw: jest.Mock }).$queryRaw;
  return { prisma, svc, update, findUnique, participant, later, owned, raw };
}

function lockTimeout() {
  return new Prisma.PrismaClientKnownRequestError('canceling statement due to lock timeout (55P03)', {
    code: 'P2010',
    clientVersion: 'test',
  });
}

describe('ActivitiesService.resubmit (reenviar una actividad rechazada)', () => {
  it('el dueño corrige los datos de FC: queda PENDING con el mismo id y fecha y sin datos de revisión', async () => {
    const { svc, update } = build();
    const result = await svc.resubmit('act1', 'u1', body());

    expect(update).toHaveBeenCalledTimes(1);
    const { where, data } = update.mock.calls[0][0] as { where: unknown; data: Record<string, unknown> };
    expect(where).toEqual({ id: 'act1' });
    expect(data).toMatchObject({
      status: ActivityStatus.PENDING,
      rejectionReason: null,
      validatedById: null,
      validatedAt: null,
      validationNote: null,
      heartRateMinutes: 25,
      hasHeartRateProof: true,
      resubmissionCount: { increment: 1 },
    });
    expect(data).not.toHaveProperty('date');
    expect(data).not.toHaveProperty('challengeId');
    expect(result.status).toBe(ActivityStatus.PENDING);
  });

  it('fotos conservadas, nuevas y quitadas: solo las nuevas pasan assertOwnedAsset y las quitadas se liberan al final', async () => {
    const { svc, update, owned, later } = build({ ...rejected, photos: [storedActivity, storedOther] });
    await svc.resubmit('act1', 'u1', body({ photos: [keptActivity, newHr] }));

    // La conservada no se revisa de nuevo; la nueva sí
    expect(owned).toHaveBeenCalledTimes(1);
    expect(owned.mock.calls[0][0]).toEqual({ url: newHr.url, publicId: newHr.cloudinaryId });
    const photos = (update.mock.calls[0][0].data as { photos: Record<string, unknown> }).photos;
    expect(photos.deleteMany).toEqual({ id: { in: ['ph2'] } });
    expect(photos.create).toEqual([newHr]);
    // Las quitadas se pasan a deleteAssetsLater después de la transacción
    expect(later).toHaveBeenCalledWith([storedOther.cloudinaryId]);
    expect(later.mock.invocationCallOrder[0]).toBeGreaterThan(update.mock.invocationCallOrder[0]);
  });

  it('si el reenvío falla no cambia ni libera ninguna foto', async () => {
    const { svc, update, later } = build({ ...rejected, photos: [storedActivity, storedOther] });
    await expect(svc.resubmit('act1', 'u1', body({ heartRateMinutes: 15 }))).rejects.toThrow(/20/);
    expect(update).not.toHaveBeenCalled();
    expect(later).not.toHaveBeenCalled();
  });

  it('re-etiquetar una foto conservada deriva hasHeartRateProof y no libera archivos', async () => {
    const { svc, update, later } = build();
    await svc.resubmit('act1', 'u1', body({ photos: [{ ...keptActivity, type: PhotoType.HEART_RATE }, newActivity] }));
    const data = update.mock.calls[0][0].data as { hasHeartRateProof: boolean; photos: Record<string, unknown> };
    expect(data.hasHeartRateProof).toBe(true);
    expect(data.photos.update).toEqual([{ where: { id: 'ph1' }, data: { type: PhotoType.HEART_RATE } }]);
    expect(data.photos.deleteMany).toBeUndefined();
    expect(later).toHaveBeenCalledWith([]);
  });

  it('una foto repetida en el cuerpo responde 400', async () => {
    const { svc, update } = build();
    await expect(svc.resubmit('act1', 'u1', body({ photos: [newHr, newHr] }))).rejects.toThrow(
      'La misma foto no puede adjuntarse dos veces',
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('una foto subida por otro participante responde 400 y no cambia nada', async () => {
    const { svc, update, later } = build();
    const foreign = { ...ownedAsset({ challengeId: 'c1', userId: 'otro', name: 'ajena' }), type: PhotoType.HEART_RATE };
    await expect(svc.resubmit('act1', 'u1', body({ photos: [keptActivity, foreign] }))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(update).not.toHaveBeenCalled();
    expect(later).not.toHaveBeenCalled();
  });

  it('aplica las reglas vigentes del reto con los mensajes del registro (período, día, FC)', async () => {
    const outside = build({ ...rejected, date: new Date('2026-06-02T00:00:00Z') });
    await expect(outside.svc.resubmit('act1', 'u1', body())).rejects.toThrow(
      'La fecha está fuera del período del reto',
    );

    const weekday = build(
      { ...rejected, date: new Date('2026-05-09T00:00:00Z') },
      { ...challenge, validDays: [1, 2, 3, 4, 5] },
    );
    await expect(weekday.svc.resubmit('act1', 'u1', body())).rejects.toThrow(
      'Ese día de la semana no es válido para este reto',
    );

    const minutes = build();
    await expect(
      minutes.svc.resubmit('act1', 'u1', body({ durationMinutes: 30, heartRateMinutes: 40 })),
    ).rejects.toThrow('Los minutos con FC no pueden superar la duración de la actividad');
    const below = build();
    await expect(below.svc.resubmit('act1', 'u1', body({ heartRateMinutes: 15 }))).rejects.toThrow(/20/);
    for (const b of [outside, weekday, minutes, below]) expect(b.update).not.toHaveBeenCalled();
  });

  it('una actividad PENDING o VALIDATED responde 403 "Solo se pueden reenviar actividades rechazadas"', async () => {
    for (const status of [ActivityStatus.PENDING, ActivityStatus.VALIDATED]) {
      const { svc, update, later } = build({ ...rejected, status });
      await expect(svc.resubmit('act1', 'u1', body())).rejects.toThrow(
        'Solo se pueden reenviar actividades rechazadas',
      );
      expect(update).not.toHaveBeenCalled();
      expect(later).not.toHaveBeenCalled();
    }
  });

  it('otro participante y un admin responden 403 "No puedes reenviar esta actividad"', async () => {
    const { svc, update } = build();
    await expect(svc.resubmit('act1', 'otro', body())).rejects.toThrow('No puedes reenviar esta actividad');
    await expect(svc.resubmit('act1', 'admin', body())).rejects.toBeInstanceOf(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
  });

  it('un dueño que ya no participa en el reto responde 403', async () => {
    const { svc, participant, update } = build();
    participant.mockResolvedValue(null);
    await expect(svc.resubmit('act1', 'u1', body())).rejects.toThrow('No participas en este reto');
    expect(update).not.toHaveBeenCalled();
  });

  it('un reto cerrado responde 400 antes que el dueño y el estado; uno que no está activo responde "El reto no está activo"', async () => {
    const closed = build(
      { ...rejected, status: ActivityStatus.VALIDATED },
      { ...challenge, status: ChallengeStatus.COMPLETED },
    );
    await expect(closed.svc.resubmit('act1', 'otro', body())).rejects.toThrow(
      'El reto está cerrado; sus actividades son definitivas',
    );
    const draft = build({ ...rejected }, { ...challenge, status: ChallengeStatus.DRAFT });
    await expect(draft.svc.resubmit('act1', 'u1', body())).rejects.toThrow('El reto no está activo');
    expect(closed.update).not.toHaveBeenCalled();
    expect(draft.update).not.toHaveBeenCalled();
  });

  it('una actividad inexistente responde 404', async () => {
    const { svc, findUnique } = build();
    findUnique.mockResolvedValue(null);
    await expect(svc.resubmit('nope', 'u1', body())).rejects.toBeInstanceOf(NotFoundException);
  });

  it('decide con la actividad releída bajo el lock: REJECTED afuera y VALIDATED adentro responde 403', async () => {
    const { svc, findUnique, update, later } = build();
    findUnique
      .mockResolvedValueOnce({ ...rejected })
      .mockResolvedValueOnce({ ...rejected, status: ActivityStatus.VALIDATED });
    await expect(svc.resubmit('act1', 'u1', body())).rejects.toThrow('Solo se pueden reenviar actividades rechazadas');
    expect(update).not.toHaveBeenCalled();
    expect(later).not.toHaveBeenCalled();
  });
});

describe('ActivitiesService: lock de la fila de la actividad (lockOpenActivity)', () => {
  const pending = { ...rejected, status: ActivityStatus.PENDING, heartRateMinutes: 25, hasHeartRateProof: true };

  function run(op: 'validate' | 'reject' | 'remove' | 'resubmit') {
    const b = build(op === 'resubmit' ? rejected : pending);
    (b.prisma as unknown as { dailyActivity: Record<string, unknown> }).dailyActivity.delete = jest.fn();
    const calls: Record<typeof op, () => Promise<unknown>> = {
      validate: () => b.svc.validate('act1', 'admin'),
      reject: () => b.svc.reject('act1', 'admin', 'motivo'),
      remove: () => b.svc.remove('act1', 'u1', UserRole.PARTICIPANT),
      resubmit: () => b.svc.resubmit('act1', 'u1', body()),
    };
    return { ...b, call: calls[op] };
  }
  const sql = (raw: jest.Mock, n: number) => (raw.mock.calls[n][0] as TemplateStringsArray).join('?');

  it.each(['validate', 'reject', 'remove', 'resubmit'] as const)(
    '%s: bloquea el reto, revisa el cierre, bloquea la fila FOR UPDATE y recién ahí relee la actividad',
    async (op) => {
      const { call, raw, findUnique } = run(op);
      await call();
      expect(raw.mock.calls).toHaveLength(2);
      expect(sql(raw, 0)).toMatch(/"Challenge".*FOR SHARE/);
      expect(sql(raw, 1)).toMatch(/"DailyActivity".*FOR UPDATE/);
      // La última lectura (la de dentro de la transacción) viene después del lock de la fila
      const lastRead = findUnique.mock.invocationCallOrder[findUnique.mock.invocationCallOrder.length - 1];
      expect(raw.mock.invocationCallOrder[1]).toBeLessThan(lastRead);
      expect(raw.mock.invocationCallOrder[0]).toBeLessThan(raw.mock.invocationCallOrder[1]);
    },
  );

  it('un reto cerrado responde 400 sin llegar a bloquear la fila', async () => {
    const b = build(pending, { ...challenge, status: ChallengeStatus.COMPLETED });
    await expect(b.svc.validate('act1', 'admin')).rejects.toThrow(
      'El reto está cerrado; sus actividades son definitivas',
    );
    expect(b.raw.mock.calls).toHaveLength(1);
  });

  it.each(['validate', 'reject', 'remove', 'resubmit'] as const)(
    '%s: si la fila desapareció tras el lock responde 404 y no 500',
    async (op) => {
      const { call, findUnique } = run(op);
      findUnique.mockResolvedValueOnce({ ...rejected, status: ActivityStatus.PENDING }).mockResolvedValueOnce(null);
      await expect(call()).rejects.toThrow(new NotFoundException('Actividad no encontrada').message);
    },
  );

  it('un timeout en el lock de la fila responde 409 con su propio mensaje', async () => {
    const { svc, raw, update } = build(pending);
    raw
      .mockImplementationOnce(async () => [{ id: 'c1', status: ChallengeStatus.ACTIVE }])
      .mockRejectedValueOnce(lockTimeout());
    const err = await svc.validate('act1', 'admin').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as ConflictException).message).toBe(ACTIVITY_LOCK_MESSAGE);
    expect(ACTIVITY_LOCK_MESSAGE).toBe('La actividad se está modificando; vuelve a intentarlo en unos segundos');
    expect(update).not.toHaveBeenCalled();
  });

  it('un timeout en el lock del reto conserva el mensaje "El reto se está cerrando…"', async () => {
    const { svc, raw, update } = build(pending);
    raw.mockRejectedValueOnce(lockTimeout());
    const err = await svc.reject('act1', 'admin', 'motivo').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as ConflictException).message).toBe(LOCK_CONFLICT_MESSAGE);
    expect(update).not.toHaveBeenCalled();
  });
});

describe('ActivitiesService.reject: historial de rechazos y solo pendientes (D12)', () => {
  const pending = { ...rejected, status: ActivityStatus.PENDING, rejectionReason: null };

  it('rechazar una pendiente escribe un registro de historial en la misma transacción', async () => {
    const { svc, update, prisma } = build(pending);
    await svc.reject('act1', 'admin1', 'Foto borrosa');
    expect(update).toHaveBeenCalledTimes(1);
    const data = update.mock.calls[0][0].data as Record<string, unknown>;
    expect(data).toMatchObject({
      status: ActivityStatus.REJECTED,
      rejectionReason: 'Foto borrosa',
      rejections: { create: { reason: 'Foto borrosa', rejectedById: 'admin1' } },
    });
    expect((prisma as unknown as { $transaction: jest.Mock }).$transaction).toHaveBeenCalledTimes(1);
  });

  it('rechazar una REJECTED o una VALIDATED responde 409 y no cambia ni escribe historial', async () => {
    for (const status of [ActivityStatus.REJECTED, ActivityStatus.VALIDATED]) {
      const { svc, update } = build({ ...rejected, status });
      const err = await svc.reject('act1', 'admin', 'Otra razón').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect((err as ConflictException).message).toBe('Solo se pueden rechazar actividades pendientes');
      expect(update).not.toHaveBeenCalled();
    }
  });

  it('el reto cerrado conserva su precedencia: una VALIDATED de un reto cerrado responde 400', async () => {
    const { svc, update } = build(
      { ...rejected, status: ActivityStatus.VALIDATED },
      { ...challenge, status: ChallengeStatus.COMPLETED },
    );
    await expect(svc.reject('act1', 'admin', 'x')).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it('reject decide con el estado releído bajo el lock: PENDING afuera y REJECTED adentro responde 409', async () => {
    const { svc, findUnique, update } = build(pending);
    findUnique
      .mockResolvedValueOnce({ ...pending })
      .mockResolvedValueOnce({ ...rejected, status: ActivityStatus.REJECTED });
    await expect(svc.reject('act1', 'admin', 'x')).rejects.toBeInstanceOf(ConflictException);
    expect(update).not.toHaveBeenCalled();
  });

  it('validar una REJECTED conserva el historial: limpia el motivo vigente y no toca las entradas', async () => {
    const { svc, update } = build({ ...rejected, heartRateMinutes: 25, hasHeartRateProof: true });
    const result = await svc.validate('act1', 'admin');
    const data = update.mock.calls[0][0].data as Record<string, unknown>;
    expect(data).toMatchObject({ status: ActivityStatus.VALIDATED, rejectionReason: null });
    expect(data).not.toHaveProperty('rejections');
    expect(result.status).toBe(ActivityStatus.VALIDATED);
  });
});

describe('checkActivityFields (reglas compartidas por registrar y reenviar)', () => {
  const rule = { minHeartRateMinutes: 20 };

  it('acepta datos que cumplen la regla vigente', () => {
    expect(() => checkActivityFields(rule, { durationMinutes: 30, heartRateMinutes: 25 }, true)).not.toThrow();
    expect(() => checkActivityFields({ minHeartRateMinutes: 0 }, { durationMinutes: 30 }, false)).not.toThrow();
  });

  it('rechaza minutos con FC mayores que la duración y datos que incumplen la regla', () => {
    expect(() => checkActivityFields(rule, { durationMinutes: 30, heartRateMinutes: 40 }, true)).toThrow(
      'Los minutos con FC no pueden superar la duración de la actividad',
    );
    expect(() => checkActivityFields(rule, { durationMinutes: 30, heartRateMinutes: 15 }, true)).toThrow(/20/);
    expect(() => checkActivityFields(rule, { durationMinutes: 30, heartRateMinutes: 25 }, false)).toThrow(/captura/i);
  });
});
