import { BadRequestException } from '@nestjs/common';
import { ActivityStatus, ChallengeStatus, ExerciseType, PhotoType } from '@prisma/client';

import { ActivitiesService } from './activities.service';
import { assessHeartRate } from './heart-rate-rule';
import { ChallengesService } from '../challenges/challenges.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateActivityDto } from './dto/create-activity.dto';

const challenge = {
  id: 'c1',
  status: ChallengeStatus.ACTIVE,
  startDate: new Date('2026-05-01T00:00:00Z'),
  endDate: new Date('2026-05-31T23:59:59Z'),
  validDays: [0, 1, 2, 3, 4, 5, 6],
  minHeartRateMinutes: 20,
};

const activityPhoto = { url: 'https://x/a.jpg', cloudinaryId: 'a', type: PhotoType.ACTIVITY };
const hrPhoto = { url: 'https://x/hr.jpg', cloudinaryId: 'hr', type: PhotoType.HEART_RATE };

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
  const prisma = {
    challenge: { findUnique: jest.fn().mockResolvedValue(opts.challenge ?? challenge) },
    challengeParticipant: { findUnique: jest.fn().mockResolvedValue({ id: 'p1' }) },
    dailyActivity: {
      create,
      update,
      findUnique: jest.fn().mockResolvedValue(opts.activity ?? null),
      findMany: jest.fn().mockResolvedValue(opts.many ?? []),
    },
  } as unknown as PrismaService;
  return { prisma, create, update };
}

function service(prisma: PrismaService) {
  return new ActivitiesService(prisma, new ChallengesService(prisma));
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
