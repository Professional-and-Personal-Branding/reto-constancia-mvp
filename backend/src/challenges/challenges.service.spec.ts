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

describe('ChallengesService.markPayment', () => {
  function build() {
    const update = jest.fn(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'p1', ...data }),
    );
    const prisma = {
      challenge: { findUnique: jest.fn().mockResolvedValue({ feePerParticipant: '120.00' }) },
      challengeParticipant: { update },
    } as unknown as PrismaService;
    return { prisma, update };
  }

  it('pagado sin monto registra la cuota del reto', async () => {
    const { prisma, update } = build();
    await new ChallengesService(prisma).markPayment('c1', 'u1', { paid: true });
    const data = update.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.amountPaid).toBe(120);
    expect(data.paidAt).toBeInstanceOf(Date);
  });

  it('pagado con monto explícito respeta el monto', async () => {
    const { prisma, update } = build();
    await new ChallengesService(prisma).markPayment('c1', 'u1', { paid: true, amountPaid: 150 });
    const data = update.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.amountPaid).toBe(150);
  });

  it('impago limpia monto y fecha', async () => {
    const { prisma, update } = build();
    await new ChallengesService(prisma).markPayment('c1', 'u1', { paid: false });
    const data = update.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.paid).toBe(false);
    expect(data.amountPaid).toBeNull();
    expect(data.paidAt).toBeNull();
  });
});

describe('ChallengesService.update: retos cerrados y período', () => {
  const withPeriod = (r: ChallengeRow, start: string, end: string) => ({
    ...r,
    startDate: new Date(start),
    endDate: new Date(end),
  });

  it('un reto cerrado no admite cambios de reglas', async () => {
    const { prisma, update } = buildPrisma([row('a', ChallengeStatus.COMPLETED, '2026-05-01')]);
    const svc = new ChallengesService(prisma);
    await expect(svc.update('a', { pointsPerKm: 5 })).rejects.toThrow('No se puede modificar un reto cerrado');
    expect(update).not.toHaveBeenCalled();
  });

  it('un reto cerrado no vuelve a borrador', async () => {
    const { prisma, update } = buildPrisma([row('a', ChallengeStatus.COMPLETED, '2026-05-01')]);
    const svc = new ChallengesService(prisma);
    await expect(svc.update('a', { status: ChallengeStatus.DRAFT })).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it('cerrar un reto ya cerrado es idempotente (no escribe ni falla)', async () => {
    const { prisma, update } = buildPrisma([row('a', ChallengeStatus.COMPLETED, '2026-05-01')]);
    const svc = new ChallengesService(prisma);
    const result = await svc.update('a', { status: ChallengeStatus.COMPLETED });
    expect(result.status).toBe(ChallengeStatus.COMPLETED);
    expect(update).not.toHaveBeenCalled();
  });

  it('valida el período combinando los valores nuevos con los guardados', async () => {
    const draft = withPeriod(row('a', ChallengeStatus.DRAFT, '2025-05-01'), '2025-05-01', '2025-05-31');
    const { prisma, update } = buildPrisma([draft as ChallengeRow]);
    const svc = new ChallengesService(prisma);
    await expect(svc.update('a', { endDate: '2025-04-15' })).rejects.toThrow('startDate debe ser menor que endDate');
    expect(update).not.toHaveBeenCalled();

    await svc.update('a', { startDate: '2025-05-10' });
    expect(update).toHaveBeenCalledTimes(1);
  });
});

describe('ChallengesService: pagos y presupuesto', () => {
  function paymentsPrisma(status: ChallengeStatus) {
    const participantUpdate = jest.fn((args: unknown) => Promise.resolve(args));
    const create = jest.fn(({ data }: { data: unknown }) => Promise.resolve(data));
    const prisma = {
      challenge: {
        findUnique: jest.fn(() => Promise.resolve({ id: 'c', status, feePerParticipant: '120.00' })),
        create,
      },
      challengeParticipant: { update: participantUpdate },
    } as unknown as PrismaService;
    return { prisma, participantUpdate, create };
  }

  it('un reto cerrado no admite registrar ni borrar pagos', async () => {
    const { prisma, participantUpdate } = paymentsPrisma(ChallengeStatus.COMPLETED);
    const svc = new ChallengesService(prisma);
    await expect(svc.markPayment('c', 'u', { paid: true })).rejects.toThrow('No se puede modificar un reto cerrado');
    await expect(svc.markPayment('c', 'u', { paid: false })).rejects.toBeInstanceOf(BadRequestException);
    expect(participantUpdate).not.toHaveBeenCalled();
  });

  it('un reto cerrado no admite subir comprobantes de pago', async () => {
    const { prisma, participantUpdate } = paymentsPrisma(ChallengeStatus.COMPLETED);
    const svc = new ChallengesService(prisma);
    await expect(
      svc.uploadPaymentProof('c', 'u', { paymentProofUrl: 'https://x/p.png', paymentProofCloudinaryId: 'p' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(participantUpdate).not.toHaveBeenCalled();
  });

  it('en un reto activo, pagar sin monto registra la cuota', async () => {
    const { prisma, participantUpdate } = paymentsPrisma(ChallengeStatus.ACTIVE);
    await new ChallengesService(prisma).markPayment('c', 'u', { paid: true });
    expect(participantUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ paid: true, amountPaid: 120 }) }),
    );
  });

  it('crear un reto sin presupuesto lo deja automático (NULL)', async () => {
    const { prisma, create } = paymentsPrisma(ChallengeStatus.DRAFT);
    (prisma.challenge.findUnique as jest.Mock).mockResolvedValueOnce(null);
    await new ChallengesService(prisma).create({
      name: 'Auto', month: 7, year: 2031, startDate: '2031-07-01', endDate: '2031-07-31',
    } as never);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ budgetTotal: null }) }));
  });
});
