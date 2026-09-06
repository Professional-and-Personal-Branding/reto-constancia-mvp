import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ChallengeStatus } from '@prisma/client';

import { ChallengesService } from './challenges.service';
import { PrismaService } from '../prisma/prisma.service';

type ChallengeRow = {
  id: string;
  name: string;
  status: ChallengeStatus;
  startDate: Date;
  participants: { userId: string }[];
};

function row(
  id: string,
  status: ChallengeStatus,
  startDate: string,
  participantIds: string[] = [],
): ChallengeRow {
  return {
    id,
    name: `Reto ${id}`,
    status,
    startDate: new Date(startDate),
    participants: participantIds.map((userId) => ({ userId })),
  };
}

function buildPrisma(rows: ChallengeRow[]) {
  const findUnique = jest.fn(({ where }: { where: { id: string } }) =>
    Promise.resolve(rows.find((r) => r.id === where.id) ?? null),
  );
  const update = jest.fn(
    ({ where, data }: { where: { id: string }; data: Partial<ChallengeRow> }) => {
      const target = rows.find((r) => r.id === where.id)!;
      return Promise.resolve({ ...target, ...data });
    },
  );
  const findMany = jest.fn(() =>
    Promise.resolve(
      rows
        .filter((r) => r.status === ChallengeStatus.ACTIVE)
        .sort((a, b) => b.startDate.getTime() - a.startDate.getTime()),
    ),
  );
  const prisma = {
    challenge: { findUnique, update, findMany },
  } as unknown as PrismaService;
  return { prisma, findUnique, update, findMany };
}

describe('ChallengesService.activate', () => {
  it('activa un reto en DRAFT', async () => {
    const { prisma, update } = buildPrisma([row('a', ChallengeStatus.DRAFT, '2026-05-01')]);
    const svc = new ChallengesService(prisma);
    const result = await svc.activate('a');
    expect(result.status).toBe(ChallengeStatus.ACTIVE);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'a' },
      data: { status: ChallengeStatus.ACTIVE },
    });
  });

  it('es idempotente si el reto ya está ACTIVE (no escribe)', async () => {
    const { prisma, update } = buildPrisma([row('a', ChallengeStatus.ACTIVE, '2026-05-01')]);
    const svc = new ChallengesService(prisma);
    const result = await svc.activate('a');
    expect(result.status).toBe(ChallengeStatus.ACTIVE);
    expect(update).not.toHaveBeenCalled();
  });

  it('rechaza reactivar un reto COMPLETED con 400', async () => {
    const { prisma, update } = buildPrisma([row('a', ChallengeStatus.COMPLETED, '2026-05-01')]);
    const svc = new ChallengesService(prisma);
    await expect(svc.activate('a')).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it('devuelve 404 si el reto no existe', async () => {
    const { prisma } = buildPrisma([]);
    const svc = new ChallengesService(prisma);
    await expect(svc.activate('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('no bloquea la activación aunque exista otro reto ACTIVE', async () => {
    const { prisma } = buildPrisma([
      row('a', ChallengeStatus.ACTIVE, '2026-05-01'),
      row('b', ChallengeStatus.DRAFT, '2026-06-01'),
    ]);
    const svc = new ChallengesService(prisma);
    const result = await svc.activate('b');
    expect(result.status).toBe(ChallengeStatus.ACTIVE);
  });
});

describe('ChallengesService.update con status ACTIVE', () => {
  it('aplica las reglas de activación (COMPLETED -> 400)', async () => {
    const { prisma, update } = buildPrisma([row('a', ChallengeStatus.COMPLETED, '2026-05-01')]);
    const svc = new ChallengesService(prisma);
    await expect(
      svc.update('a', { status: ChallengeStatus.ACTIVE }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it('activa y además aplica el resto de campos', async () => {
    const { prisma, update } = buildPrisma([row('a', ChallengeStatus.DRAFT, '2026-05-01')]);
    const svc = new ChallengesService(prisma);
    const result = await svc.update('a', {
      status: ChallengeStatus.ACTIVE,
      name: 'Renombrado',
    });
    expect(update).toHaveBeenNthCalledWith(1, {
      where: { id: 'a' },
      data: { status: ChallengeStatus.ACTIVE },
    });
    expect(update).toHaveBeenNthCalledWith(2, {
      where: { id: 'a' },
      data: { name: 'Renombrado' },
    });
    expect(result.name).toBe('Renombrado');
  });

  it('sin más campos devuelve el reto activado sin segunda escritura', async () => {
    const { prisma, update } = buildPrisma([row('a', ChallengeStatus.DRAFT, '2026-05-01')]);
    const svc = new ChallengesService(prisma);
    const result = await svc.update('a', { status: ChallengeStatus.ACTIVE });
    expect(result.status).toBe(ChallengeStatus.ACTIVE);
    expect(update).toHaveBeenCalledTimes(1);
  });
});

describe('ChallengesService.findActiveList', () => {
  it('lista los activos del más reciente al más antiguo con isParticipant', async () => {
    const { prisma } = buildPrisma([
      row('a', ChallengeStatus.ACTIVE, '2026-05-01', ['u1']),
      row('b', ChallengeStatus.ACTIVE, '2026-06-01', ['u2']),
      row('c', ChallengeStatus.DRAFT, '2026-07-01', ['u1']),
    ]);
    const svc = new ChallengesService(prisma);
    const list = await svc.findActiveList('u1');
    expect(list.map((c) => c.id)).toEqual(['b', 'a']);
    expect(list.map((c) => c.isParticipant)).toEqual([false, true]);
  });

  it('devuelve lista vacía sin retos activos', async () => {
    const { prisma } = buildPrisma([row('c', ChallengeStatus.DRAFT, '2026-07-01')]);
    const svc = new ChallengesService(prisma);
    expect(await svc.findActiveList('u1')).toEqual([]);
  });
});

describe('ChallengesService.findActive', () => {
  const rows = () => [
    row('a', ChallengeStatus.ACTIVE, '2026-05-01', ['u1']),
    row('b', ChallengeStatus.ACTIVE, '2026-06-01', ['u2']),
  ];

  it('prefiere el reto activo más reciente en el que participa el usuario', async () => {
    const svc = new ChallengesService(buildPrisma(rows()).prisma);
    const active = await svc.findActive('u1');
    expect(active?.id).toBe('a');
    expect(active && 'isParticipant' in active).toBe(false);
  });

  it('si no participa en ninguno devuelve el activo más reciente', async () => {
    const svc = new ChallengesService(buildPrisma(rows()).prisma);
    const active = await svc.findActive('u9');
    expect(active?.id).toBe('b');
  });

  it('devuelve null sin retos activos', async () => {
    const svc = new ChallengesService(buildPrisma([]).prisma);
    expect(await svc.findActive('u1')).toBeNull();
  });
});
