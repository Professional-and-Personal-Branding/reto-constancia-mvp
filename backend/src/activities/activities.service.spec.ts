import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ActivityStatus, ChallengeStatus, ExerciseType, PhotoType, UserRole } from '@prisma/client';

import { ActivitiesService } from './activities.service';
import { assessHeartRate } from './heart-rate-rule';
import { ChallengesService } from '../challenges/challenges.service';
import { ResultsService } from '../challenges/results.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { localUploads, ownedAsset } from '../../test/helpers/assets';
import { withLocks } from '../../test/helpers/prisma-lock';

const challenge = {
  id: 'c1',
  status: ChallengeStatus.ACTIVE,
  startDate: new Date('2026-05-01T00:00:00Z'),
  endDate: new Date('2026-05-31T23:59:59Z'),
  validDays: [0, 1, 2, 3, 4, 5, 6],
  minHeartRateMinutes: 20,
};

// Evidencia propia de u1 en el reto c1 (spec upload-guardrails)
const activityPhoto = { ...ownedAsset({ challengeId: 'c1', userId: 'u1', name: 'a' }), type: PhotoType.ACTIVITY };
const hrPhoto = { ...ownedAsset({ challengeId: 'c1', userId: 'u1', name: 'hr' }), type: PhotoType.HEART_RATE };

function baseDto(over: Partial<CreateActivityDto> = {}): CreateActivityDto {
  return {
    challengeId: 'c1',
    date: '2026-05-06',
    exerciseType: ExerciseType.RUNNING,
    durationMinutes: 30,
    photos: [activityPhoto, hrPhoto],
    ...over,
  } as CreateActivityDto;
}

function buildPrisma(opts: { challenge?: unknown; activity?: unknown; many?: unknown[] } = {}) {
  const create = jest.fn(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'act1', ...data, photos: [] }),
  );
  const update = jest.fn(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'act1', ...(opts.activity as object), ...data }),
  );
  const prisma = withLocks({
    challenge: { findUnique: jest.fn().mockResolvedValue(opts.challenge ?? challenge) },
    challengeParticipant: { findUnique: jest.fn().mockResolvedValue({ id: 'p1' }) },
    dailyActivity: {
      create,
      update,
      findUnique: jest.fn().mockResolvedValue(opts.activity ?? null),
      findMany: jest.fn().mockResolvedValue(opts.many ?? []),
    },
  } as unknown as PrismaService);
  return { prisma, create, update };
}

function service(prisma: PrismaService) {
  const uploads = localUploads();
  return new ActivitiesService(prisma, new ChallengesService(prisma, uploads, new ResultsService(prisma)), uploads);
}

describe('assessHeartRate (regla pura)', () => {
  const rule = { minHeartRateMinutes: 20 };

  it('cumple con minutos >= mínimo y captura', () => {
    expect(assessHeartRate(rule, { heartRateMinutes: 25, hasHeartRateProof: true })).toEqual({
      compliant: true,
      reasons: [],
    });
  });

  it('no cumple si los minutos están por debajo del mínimo (menciona el mínimo)', () => {
    const r = assessHeartRate(rule, { heartRateMinutes: 15, hasHeartRateProof: true });
    expect(r.compliant).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/20/);
  });

  it('no cumple si faltan los minutos', () => {
    const r = assessHeartRate(rule, { heartRateMinutes: null, hasHeartRateProof: true });
    expect(r.compliant).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/minutos/i);
  });

  it('no cumple sin captura de FC', () => {
    const r = assessHeartRate(rule, { heartRateMinutes: 40, hasHeartRateProof: false });
    expect(r.compliant).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/captura/i);
  });

  it('un reto con mínimo 0 no aplica la regla', () => {
    expect(
      assessHeartRate({ minHeartRateMinutes: 0 }, { heartRateMinutes: null, hasHeartRateProof: false })
        .compliant,
    ).toBe(true);
  });
});

describe('ActivitiesService.create (regla de FC)', () => {
  it('rechaza minutos con FC mayores a la duración', async () => {
    const { prisma, create } = buildPrisma();
    await expect(
      service(prisma).create('u1', baseDto({ durationMinutes: 30, heartRateMinutes: 45 })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('rechaza una actividad por debajo del mínimo mencionando el mínimo', async () => {
    const { prisma, create } = buildPrisma();
    await expect(
      service(prisma).create('u1', baseDto({ heartRateMinutes: 15 })),
    ).rejects.toThrow(/20/);
    expect(create).not.toHaveBeenCalled();
  });

  it('deriva hasHeartRateProof de las fotos: sin foto HEART_RATE se rechaza aunque el flag venga true', async () => {
    const { prisma, create } = buildPrisma();
    await expect(
      service(prisma).create(
        'u1',
        baseDto({ heartRateMinutes: 25, hasHeartRateProof: true, photos: [activityPhoto] }),
      ),
    ).rejects.toThrow(/captura/i);
    expect(create).not.toHaveBeenCalled();
  });

  it('crea una actividad conforme con heartRateCompliant=true y el flag derivado', async () => {
    const { prisma, create } = buildPrisma();
    const result = await service(prisma).create('u1', baseDto({ heartRateMinutes: 25 }));
    expect(create).toHaveBeenCalledTimes(1);
    const data = create.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.heartRateMinutes).toBe(25);
    expect(data.hasHeartRateProof).toBe(true);
    expect(result.heartRateCompliant).toBe(true);
  });

  it('con mínimo 0 acepta actividades sin minutos ni captura', async () => {
    const { prisma, create } = buildPrisma({ challenge: { ...challenge, minHeartRateMinutes: 0 } });
    const result = await service(prisma).create('u1', baseDto({ photos: [activityPhoto] }));
    expect(create).toHaveBeenCalledTimes(1);
    expect(result.heartRateCompliant).toBe(true);
  });
});

describe('ActivitiesService.create (evidencia propia)', () => {
  it('acepta la foto de actividad y la captura de FC de la propia carpeta', async () => {
    const { prisma, create } = buildPrisma();
    await service(prisma).create('u1', baseDto({ heartRateMinutes: 25 }));
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('rechaza una foto subida fuera de la plataforma', async () => {
    const { prisma, create } = buildPrisma();
    const external = { url: 'https://example.com/a.jpg', cloudinaryId: 'e2e/a', type: PhotoType.ACTIVITY };
    await expect(service(prisma).create('u1', baseDto({ photos: [external] }))).rejects.toThrow(
      'La foto debe subirse desde la plataforma',
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('rechaza la foto de otro participante del mismo reto', async () => {
    const { prisma, create } = buildPrisma();
    const foreign = { ...ownedAsset({ challengeId: 'c1', userId: 'u2', name: 'a' }), type: PhotoType.ACTIVITY };
    await expect(service(prisma).create('u1', baseDto({ photos: [foreign, hrPhoto] }))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('rechaza un comprobante usado como foto de actividad', async () => {
    const { prisma, create } = buildPrisma();
    const proof = { ...ownedAsset({ challengeId: 'c1', userId: 'u1', purpose: 'payment-proof', name: 'p' }), type: PhotoType.ACTIVITY };
    await expect(service(prisma).create('u1', baseDto({ photos: [proof, hrPhoto] }))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('rechaza la misma foto adjunta dos veces', async () => {
    const { prisma, create } = buildPrisma();
    await expect(
      service(prisma).create('u1', baseDto({ photos: [activityPhoto, { ...activityPhoto, type: PhotoType.HEART_RATE }] })),
    ).rejects.toThrow('La misma foto no puede adjuntarse dos veces');
    expect(create).not.toHaveBeenCalled();
  });
});

describe('ActivitiesService.validate (override)', () => {
  const pendingNonCompliant = {
    id: 'act1',
    status: ActivityStatus.PENDING,
    heartRateMinutes: 10,
    hasHeartRateProof: true,
    challenge: { minHeartRateMinutes: 20 },
    photos: [],
  };
  const pendingCompliant = { ...pendingNonCompliant, heartRateMinutes: 25 };

  it('rechaza validar una actividad no conforme sin override', async () => {
    const { prisma, update } = buildPrisma({ activity: pendingNonCompliant });
    await expect(service(prisma).validate('act1', 'admin')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('rechaza override sin nota', async () => {
    const { prisma, update } = buildPrisma({ activity: pendingNonCompliant });
    await expect(
      service(prisma).validate('act1', 'admin', { override: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it('valida con override y guarda la nota; heartRateCompliant sigue false', async () => {
    const { prisma, update } = buildPrisma({ activity: pendingNonCompliant });
    const result = await service(prisma).validate('act1', 'admin', {
      override: true,
      note: 'Registro histórico verificado en persona',
    });
    expect(update).toHaveBeenCalledTimes(1);
    const data = update.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.status).toBe(ActivityStatus.VALIDATED);
    expect(data.validationNote).toBe('Registro histórico verificado en persona');
    expect(result.heartRateCompliant).toBe(false);
  });

  it('valida una actividad conforme sin cuerpo y sin nota', async () => {
    const { prisma, update } = buildPrisma({ activity: pendingCompliant });
    const result = await service(prisma).validate('act1', 'admin');
    const data = update.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.validationNote).toBeNull();
    expect(result.heartRateCompliant).toBe(true);
  });
});

describe('ActivitiesService.findPending (heartRateCompliant derivado)', () => {
  it('marca cada actividad según la regla de su reto', async () => {
    const { prisma } = buildPrisma({
      many: [
        { id: 'a', heartRateMinutes: 25, hasHeartRateProof: true, challenge: { minHeartRateMinutes: 20 } },
        { id: 'b', heartRateMinutes: 10, hasHeartRateProof: true, challenge: { minHeartRateMinutes: 20 } },
      ],
    });
    const list = await service(prisma).findPending('c1');
    expect(list.map((a) => a.heartRateCompliant)).toEqual([true, false]);
  });
});

describe('ActivitiesService.findOneForViewer (solo el dueño o un admin)', () => {
  const owned = {
    id: 'act1',
    userId: 'ana',
    status: ActivityStatus.PENDING,
    heartRateMinutes: 25,
    hasHeartRateProof: true,
    photos: [],
    challenge,
  };

  it('el dueño recibe su actividad con heartRateCompliant', async () => {
    const { prisma } = buildPrisma({ activity: owned });
    const a = await service(prisma).findOneForViewer('act1', 'ana', UserRole.PARTICIPANT);
    expect(a.id).toBe('act1');
    expect(a.heartRateCompliant).toBe(true);
  });

  it('otro participante recibe 403 con el mensaje exacto', async () => {
    const { prisma } = buildPrisma({ activity: owned });
    await expect(
      service(prisma).findOneForViewer('act1', 'bruno', UserRole.PARTICIPANT),
    ).rejects.toThrow(new ForbiddenException('No puedes ver esta actividad'));
  });

  it('un admin recibe cualquier actividad', async () => {
    const { prisma } = buildPrisma({ activity: owned });
    const a = await service(prisma).findOneForViewer('act1', 'admin', UserRole.ADMIN);
    expect(a.userId).toBe('ana');
  });

  it('una actividad inexistente da 404 a cualquier rol', async () => {
    const { prisma } = buildPrisma();
    await expect(
      service(prisma).findOneForViewer('nope', 'ana', UserRole.PARTICIPANT),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('ActivitiesService: reto cerrado (closed-challenge-freeze)', () => {
  const closed = { ...challenge, status: ChallengeStatus.COMPLETED };
  const pending = {
    id: 'act1',
    challengeId: 'c1',
    userId: 'u1',
    status: ActivityStatus.PENDING,
    heartRateMinutes: 25,
    hasHeartRateProof: true,
    challenge: closed,
    photos: [],
  };
  function build(activity: unknown, ch: unknown = closed) {
    const built = buildPrisma({ activity, challenge: ch });
    const remove = jest.fn().mockResolvedValue(undefined);
    (built.prisma as unknown as { dailyActivity: Record<string, unknown> }).dailyActivity.delete = remove;
    return { ...built, remove };
  }

  it('validar, rechazar o borrar en un reto cerrado responde 400, también al admin', async () => {
    const { prisma, update, remove } = build(pending);
    const svc = service(prisma);
    const msg = 'El reto está cerrado; sus actividades son definitivas';
    await expect(svc.validate('act1', 'admin')).rejects.toThrow(msg);
    await expect(svc.reject('act1', 'admin', 'motivo')).rejects.toThrow(msg);
    await expect(svc.remove('act1', 'admin', UserRole.ADMIN)).rejects.toThrow(msg);
    expect(update).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it('el reto cerrado va antes que los chequeos de dueño y de estado', async () => {
    const { prisma, remove } = build({ ...pending, status: ActivityStatus.VALIDATED });
    const svc = service(prisma);
    // Un extraño y el dueño de una validada reciben 400, no 403
    await expect(svc.remove('act1', 'otro', UserRole.PARTICIPANT)).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.remove('act1', 'u1', UserRole.PARTICIPANT)).rejects.toBeInstanceOf(BadRequestException);
    // Validar de nuevo una ya validada deja de ser un no-op
    await expect(svc.validate('act1', 'admin')).rejects.toBeInstanceOf(BadRequestException);
    expect(remove).not.toHaveBeenCalled();
  });

  it('crear una actividad cuando el reto se cerró bajo el lock responde "El reto no está activo"', async () => {
    const { prisma, create } = buildPrisma();
    // El chequeo previo lee ACTIVE; el lock ve el reto ya cerrado
    (prisma as unknown as { $queryRaw: jest.Mock }).$queryRaw.mockResolvedValueOnce([{ id: 'c1', status: ChallengeStatus.COMPLETED }]);
    await expect(service(prisma).create('u1', baseDto({ heartRateMinutes: 25 }))).rejects.toThrow('El reto no está activo');
    expect(create).not.toHaveBeenCalled();
  });

  it('en un reto activo, borrar sigue las reglas de siempre', async () => {
    const { prisma, remove } = build({ ...pending, challenge }, challenge);
    const svc = service(prisma);
    await expect(svc.remove('act1', 'otro', UserRole.PARTICIPANT)).rejects.toBeInstanceOf(ForbiddenException);
    await svc.remove('act1', 'u1', UserRole.PARTICIPANT);
    expect(remove).toHaveBeenCalledWith({ where: { id: 'act1' } });
  });

  it('decide con la actividad releída bajo el lock', async () => {
    const { prisma, update } = build({ ...pending, challenge }, challenge);
    // Fuera del lock se ve PENDING; adentro ya está VALIDATED: no se vuelve a escribir
    (prisma as unknown as { dailyActivity: { findUnique: jest.Mock } }).dailyActivity.findUnique
      .mockResolvedValueOnce({ ...pending, challenge })
      .mockResolvedValueOnce({ ...pending, challenge, status: ActivityStatus.VALIDATED });
    const result = await service(prisma).validate('act1', 'admin');
    expect(result.status).toBe(ActivityStatus.VALIDATED);
    expect(update).not.toHaveBeenCalled();
  });
});

describe('ActivitiesService.remove: libera las fotos (upload-asset-cleanup)', () => {
  function build(ch: unknown) {
    const activity = {
      id: 'act1',
      challengeId: 'c1',
      userId: 'u1',
      status: ActivityStatus.PENDING,
      challenge: ch,
      photos: [{ cloudinaryId: 'reto-constancia/c1/u1/activity/a' }, { cloudinaryId: 'reto-constancia/c1/u1/activity/hr' }],
    };
    const { prisma } = buildPrisma({ activity, challenge: ch });
    const remove = jest.fn().mockResolvedValue(undefined);
    (prisma as unknown as { dailyActivity: Record<string, unknown> }).dailyActivity.delete = remove;
    const uploads = localUploads();
    const later = jest.spyOn(uploads, 'deleteAssetsLater').mockResolvedValue(undefined);
    const svc = new ActivitiesService(prisma, new ChallengesService(prisma, uploads, new ResultsService(prisma)), uploads);
    return { svc, later, remove };
  }

  it('después de borrar pide liberar las fotos de la actividad', async () => {
    const { svc, later, remove } = build(challenge);
    await svc.remove('act1', 'u1', UserRole.PARTICIPANT);
    expect(remove).toHaveBeenCalled();
    expect(later).toHaveBeenCalledWith(['reto-constancia/c1/u1/activity/a', 'reto-constancia/c1/u1/activity/hr']);
  });

  it('si el borrado se rechaza no libera nada', async () => {
    const closed = build({ ...challenge, status: ChallengeStatus.COMPLETED });
    await expect(closed.svc.remove('act1', 'u1', UserRole.PARTICIPANT)).rejects.toBeInstanceOf(BadRequestException);
    expect(closed.later).not.toHaveBeenCalled();
    const stranger = build(challenge);
    await expect(stranger.svc.remove('act1', 'otro', UserRole.PARTICIPANT)).rejects.toBeInstanceOf(ForbiddenException);
    expect(stranger.later).not.toHaveBeenCalled();
  });
});
