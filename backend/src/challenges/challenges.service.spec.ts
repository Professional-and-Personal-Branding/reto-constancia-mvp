import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ChallengeStatus, Prisma } from '@prisma/client';

import { ChallengesService } from './challenges.service';
import { ResultsService } from './results.service';

/** Servicio con sus dependencias reales sobre el mismo mock de Prisma. */
function challengesService(prisma: PrismaService): ChallengesService {
  return new ChallengesService(prisma, localUploads(), new ResultsService(prisma));
}
import { PrismaService } from '../prisma/prisma.service';
import { localUploads, ownedAsset } from '../../test/helpers/assets';
import { withLocks } from '../../test/helpers/prisma-lock';

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
  const prisma = withLocks({
    challenge: { findUnique, update, findMany },
  } as unknown as PrismaService);
  return { prisma, findUnique, update, findMany };
}

describe('ChallengesService.activate', () => {
  it('activa un reto en DRAFT', async () => {
    const { prisma, update } = buildPrisma([row('a', ChallengeStatus.DRAFT, '2026-05-01')]);
    const svc = challengesService(prisma);
    const result = await svc.activate('a');
    expect(result.status).toBe(ChallengeStatus.ACTIVE);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'a' },
      data: { status: ChallengeStatus.ACTIVE },
    });
  });

  it('es idempotente si el reto ya está ACTIVE (no escribe)', async () => {
    const { prisma, update } = buildPrisma([row('a', ChallengeStatus.ACTIVE, '2026-05-01')]);
    const svc = challengesService(prisma);
    const result = await svc.activate('a');
    expect(result.status).toBe(ChallengeStatus.ACTIVE);
    expect(update).not.toHaveBeenCalled();
  });

  it('rechaza reactivar un reto COMPLETED con 400', async () => {
    const { prisma, update } = buildPrisma([row('a', ChallengeStatus.COMPLETED, '2026-05-01')]);
    const svc = challengesService(prisma);
    await expect(svc.activate('a')).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it('devuelve 404 si el reto no existe', async () => {
    const { prisma } = buildPrisma([]);
    const svc = challengesService(prisma);
    await expect(svc.activate('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('no bloquea la activación aunque exista otro reto ACTIVE', async () => {
    const { prisma } = buildPrisma([
      row('a', ChallengeStatus.ACTIVE, '2026-05-01'),
      row('b', ChallengeStatus.DRAFT, '2026-06-01'),
    ]);
    const svc = challengesService(prisma);
    const result = await svc.activate('b');
    expect(result.status).toBe(ChallengeStatus.ACTIVE);
  });
});

describe('ChallengesService.update con status ACTIVE', () => {
  it('aplica las reglas de activación (COMPLETED -> 400)', async () => {
    const { prisma, update } = buildPrisma([row('a', ChallengeStatus.COMPLETED, '2026-05-01')]);
    const svc = challengesService(prisma);
    await expect(
      svc.update('a', { status: ChallengeStatus.ACTIVE }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it('activa y además aplica el resto de campos', async () => {
    const { prisma, update } = buildPrisma([row('a', ChallengeStatus.DRAFT, '2026-05-01')]);
    const svc = challengesService(prisma);
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
    const svc = challengesService(prisma);
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
    const svc = challengesService(prisma);
    const list = await svc.findActiveList('u1');
    expect(list.map((c) => c.id)).toEqual(['b', 'a']);
    expect(list.map((c) => c.isParticipant)).toEqual([false, true]);
  });

  it('devuelve lista vacía sin retos activos', async () => {
    const { prisma } = buildPrisma([row('c', ChallengeStatus.DRAFT, '2026-07-01')]);
    const svc = challengesService(prisma);
    expect(await svc.findActiveList('u1')).toEqual([]);
  });
});

describe('ChallengesService.findActive', () => {
  const rows = () => [
    row('a', ChallengeStatus.ACTIVE, '2026-05-01', ['u1']),
    row('b', ChallengeStatus.ACTIVE, '2026-06-01', ['u2']),
  ];

  it('prefiere el reto activo más reciente en el que participa el usuario', async () => {
    const svc = challengesService(buildPrisma(rows()).prisma);
    const active = await svc.findActive('u1');
    expect(active?.id).toBe('a');
    expect(active && 'isParticipant' in active).toBe(false);
  });

  it('si no participa en ninguno devuelve el activo más reciente', async () => {
    const svc = challengesService(buildPrisma(rows()).prisma);
    const active = await svc.findActive('u9');
    expect(active?.id).toBe('b');
  });

  it('devuelve null sin retos activos', async () => {
    const svc = challengesService(buildPrisma([]).prisma);
    expect(await svc.findActive('u1')).toBeNull();
  });
});

describe('ChallengesService.markPayment', () => {
  function build() {
    const update = jest.fn(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'p1', ...data }),
    );
    const prisma = withLocks({
      challenge: { findUnique: jest.fn().mockResolvedValue({ feePerParticipant: '120.00' }) },
      challengeParticipant: { update },
    } as unknown as PrismaService);
    return { prisma, update };
  }

  it('pagado sin monto registra la cuota del reto', async () => {
    const { prisma, update } = build();
    await challengesService(prisma).markPayment('c1', 'u1', { paid: true });
    const data = update.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.amountPaid).toBe(120);
    expect(data.paidAt).toBeInstanceOf(Date);
  });

  it('pagado con monto explícito respeta el monto', async () => {
    const { prisma, update } = build();
    await challengesService(prisma).markPayment('c1', 'u1', { paid: true, amountPaid: 150 });
    const data = update.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.amountPaid).toBe(150);
  });

  it('impago limpia monto y fecha', async () => {
    const { prisma, update } = build();
    await challengesService(prisma).markPayment('c1', 'u1', { paid: false });
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
    const svc = challengesService(prisma);
    await expect(svc.update('a', { pointsPerKm: 5 })).rejects.toThrow('No se puede modificar un reto cerrado');
    expect(update).not.toHaveBeenCalled();
  });

  it('un reto cerrado no vuelve a borrador', async () => {
    const { prisma, update } = buildPrisma([row('a', ChallengeStatus.COMPLETED, '2026-05-01')]);
    const svc = challengesService(prisma);
    await expect(svc.update('a', { status: ChallengeStatus.DRAFT })).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it('cerrar un reto ya cerrado es idempotente (no escribe ni falla)', async () => {
    const { prisma, update } = buildPrisma([row('a', ChallengeStatus.COMPLETED, '2026-05-01')]);
    const svc = challengesService(prisma);
    const result = await svc.update('a', { status: ChallengeStatus.COMPLETED });
    expect(result.status).toBe(ChallengeStatus.COMPLETED);
    expect(update).not.toHaveBeenCalled();
  });

  it('valida el período combinando los valores nuevos con los guardados', async () => {
    const draft = withPeriod(row('a', ChallengeStatus.DRAFT, '2025-05-01'), '2025-05-01', '2025-05-31');
    const { prisma, update } = buildPrisma([draft as ChallengeRow]);
    const svc = challengesService(prisma);
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
    const prisma = withLocks({
      challenge: {
        findUnique: jest.fn(() => Promise.resolve({ id: 'c', status, feePerParticipant: '120.00' })),
        create,
      },
      challengeParticipant: { update: participantUpdate },
    } as unknown as PrismaService);
    return { prisma, participantUpdate, create };
  }

  it('un reto cerrado no admite registrar ni borrar pagos', async () => {
    const { prisma, participantUpdate } = paymentsPrisma(ChallengeStatus.COMPLETED);
    const svc = challengesService(prisma);
    await expect(svc.markPayment('c', 'u', { paid: true })).rejects.toThrow('No se puede modificar un reto cerrado');
    await expect(svc.markPayment('c', 'u', { paid: false })).rejects.toBeInstanceOf(BadRequestException);
    expect(participantUpdate).not.toHaveBeenCalled();
  });

  it('un reto cerrado no admite subir comprobantes de pago', async () => {
    const { prisma, participantUpdate } = paymentsPrisma(ChallengeStatus.COMPLETED);
    const svc = challengesService(prisma);
    await expect(
      svc.uploadPaymentProof('c', 'u', { paymentProofUrl: 'https://x/p.png', paymentProofCloudinaryId: 'p' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(participantUpdate).not.toHaveBeenCalled();
  });

  it('en un reto activo, pagar sin monto registra la cuota', async () => {
    const { prisma, participantUpdate } = paymentsPrisma(ChallengeStatus.ACTIVE);
    await challengesService(prisma).markPayment('c', 'u', { paid: true });
    expect(participantUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ paid: true, amountPaid: 120 }) }),
    );
  });

  it('crear un reto sin presupuesto lo deja automático (NULL)', async () => {
    const { prisma, create } = paymentsPrisma(ChallengeStatus.DRAFT);
    (prisma.challenge.findUnique as jest.Mock).mockResolvedValueOnce(null);
    await challengesService(prisma).create({
      name: 'Auto', month: 7, year: 2031, startDate: '2031-07-01', endDate: '2031-07-31',
    } as never);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ budgetTotal: null }) }));
  });
});

describe('ChallengesService: participación y comprobante propio (upload-guardrails)', () => {
  function build(status: ChallengeStatus, enrolled: boolean) {
    const participantUpdate = jest.fn((args: unknown) => Promise.resolve(args));
    const prisma = withLocks({
      challenge: { findUnique: jest.fn(() => Promise.resolve({ id: 'c', status, feePerParticipant: '120.00' })) },
      challengeParticipant: {
        findUnique: jest.fn(() => Promise.resolve(enrolled ? { id: 'p' } : null)),
        update: participantUpdate,
      },
    } as unknown as PrismaService);
    return { svc: challengesService(prisma), participantUpdate };
  }
  const ownProof = () => {
    const asset = ownedAsset({ challengeId: 'c', userId: 'u', purpose: 'payment-proof', name: 'p', ext: 'pdf' });
    return { paymentProofUrl: asset.url, paymentProofCloudinaryId: asset.cloudinaryId };
  };

  it('assertActiveParticipant: inactivo 400 y no inscrito 403', async () => {
    await expect(build(ChallengeStatus.DRAFT, true).svc.assertActiveParticipant('c', 'u')).rejects.toThrow('El reto no está activo');
    await expect(build(ChallengeStatus.ACTIVE, false).svc.assertActiveParticipant('c', 'u')).rejects.toThrow('No participas en este reto');
    await expect(build(ChallengeStatus.ACTIVE, true).svc.assertActiveParticipant('c', 'u')).resolves.toMatchObject({ id: 'c' });
  });

  it('assertPaymentParticipant: cerrado 400, no inscrito 403, borrador permitido', async () => {
    await expect(build(ChallengeStatus.COMPLETED, true).svc.assertPaymentParticipant('c', 'u')).rejects.toThrow('No se puede modificar un reto cerrado');
    await expect(build(ChallengeStatus.ACTIVE, false).svc.assertPaymentParticipant('c', 'u')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(build(ChallengeStatus.DRAFT, true).svc.assertPaymentParticipant('c', 'u')).resolves.toMatchObject({ id: 'c' });
  });

  it('un no inscrito no puede subir comprobante (403)', async () => {
    const { svc, participantUpdate } = build(ChallengeStatus.ACTIVE, false);
    await expect(svc.uploadPaymentProof('c', 'u', ownProof())).rejects.toThrow('No participas en este reto');
    expect(participantUpdate).not.toHaveBeenCalled();
  });

  it('rechaza el comprobante de otro participante o externo', async () => {
    const { svc, participantUpdate } = build(ChallengeStatus.ACTIVE, true);
    const foreign = ownedAsset({ challengeId: 'c', userId: 'otro', purpose: 'payment-proof', name: 'p' });
    await expect(
      svc.uploadPaymentProof('c', 'u', { paymentProofUrl: foreign.url, paymentProofCloudinaryId: foreign.cloudinaryId }),
    ).rejects.toThrow('El comprobante debe subirse desde la plataforma');
    await expect(
      svc.uploadPaymentProof('c', 'u', { paymentProofUrl: 'https://example.com/p.pdf', paymentProofCloudinaryId: 'demo/p' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(participantUpdate).not.toHaveBeenCalled();
  });

  it('guarda el comprobante propio, también en PDF', async () => {
    const { svc, participantUpdate } = build(ChallengeStatus.ACTIVE, true);
    await svc.uploadPaymentProof('c', 'u', ownProof());
    expect(participantUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ paymentProofCloudinaryId: ownProof().paymentProofCloudinaryId }) }),
    );
  });

  it('marcar o desmarcar un pago no toca el comprobante guardado', async () => {
    const { svc, participantUpdate } = build(ChallengeStatus.ACTIVE, true);
    await svc.markPayment('c', 'u', { paid: false });
    const data = (participantUpdate.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data).not.toHaveProperty('paymentProofUrl');
    expect(data).not.toHaveProperty('paymentProofCloudinaryId');
  });
});

describe('ChallengesService: escrituras serializadas con el cierre (closed-challenge-freeze)', () => {
  /** El chequeo previo lee ACTIVE; el lock ve el reto ya cerrado (otro cierre ganó la carrera). */
  function racing() {
    const writes = {
      participantCreate: jest.fn(),
      participantDelete: jest.fn(),
      participantUpdate: jest.fn(),
      challengeUpdate: jest.fn(),
    };
    const active = { id: 'c', status: ChallengeStatus.ACTIVE, feePerParticipant: '120.00', startDate: new Date('2026-05-01'), endDate: new Date('2026-05-31'), participants: [] };
    const prisma = withLocks(
      {
        challenge: {
          findUnique: jest.fn().mockResolvedValue(active),
          update: writes.challengeUpdate,
          findUniqueOrThrow: jest.fn().mockResolvedValue({ ...active, status: ChallengeStatus.COMPLETED }),
        },
        user: { findUnique: jest.fn().mockResolvedValue({ id: 'u', active: true }) },
        challengeParticipant: {
          findUnique: jest.fn().mockResolvedValue({ id: 'p' }),
          create: writes.participantCreate,
          delete: writes.participantDelete,
          update: writes.participantUpdate,
        },
      } as unknown as PrismaService,
      async (id) => ({ id, status: ChallengeStatus.COMPLETED }),
    );
    return { svc: challengesService(prisma), writes };
  }
  const closedMsg = 'No se puede modificar un reto cerrado';

  it('inscribir, quitar y registrar pagos se rechazan si el reto se cerró bajo el lock', async () => {
    const { svc, writes } = racing();
    await expect(svc.addParticipant('c', 'u')).rejects.toThrow(closedMsg);
    await expect(svc.removeParticipant('c', 'u')).rejects.toThrow(closedMsg);
    await expect(svc.markPayment('c', 'u', { paid: true })).rejects.toThrow(closedMsg);
    const proof = ownedAsset({ challengeId: 'c', userId: 'u', purpose: 'payment-proof', name: 'p' });
    await expect(
      svc.uploadPaymentProof('c', 'u', { paymentProofUrl: proof.url, paymentProofCloudinaryId: proof.cloudinaryId }),
    ).rejects.toThrow(closedMsg);
    expect(writes.participantCreate).not.toHaveBeenCalled();
    expect(writes.participantDelete).not.toHaveBeenCalled();
    expect(writes.participantUpdate).not.toHaveBeenCalled();
  });

  it('un cambio de reglas que leyó ACTIVE no cae después del cierre', async () => {
    const { svc, writes } = racing();
    await expect(svc.update('c', { pointsPerKm: 5 })).rejects.toThrow(closedMsg);
    expect(writes.challengeUpdate).not.toHaveBeenCalled();
  });

  it('pedir el cierre cuando otro cierre ganó la carrera sigue siendo idempotente', async () => {
    const { svc, writes } = racing();
    const result = await svc.update('c', { status: ChallengeStatus.COMPLETED, name: undefined });
    expect(result.status).toBe(ChallengeStatus.COMPLETED);
    expect(writes.challengeUpdate).not.toHaveBeenCalled();
  });

  it('activar un reto que se cerró bajo el lock responde 400', async () => {
    const { svc, writes } = racing();
    const draft = { id: 'c', status: ChallengeStatus.DRAFT };
    (svc as unknown as { prisma: { challenge: { findUnique: jest.Mock } } }).prisma.challenge.findUnique.mockResolvedValueOnce(draft);
    await expect(svc.activate('c')).rejects.toThrow('Un reto cerrado no puede reactivarse');
    expect(writes.challengeUpdate).not.toHaveBeenCalled();
  });
});

describe('ChallengesService: inscripción (challenge-enrollment)', () => {
  const U1 = '00000000-0000-4000-8000-000000000001';
  const U2 = '00000000-0000-4000-8000-000000000002';

  function build(status: ChallengeStatus, lockedStatus: ChallengeStatus = status, challengeExists = true) {
    const writes = {
      participantCreate: jest.fn().mockResolvedValue({ id: 'p' }),
      participantCreateMany: jest.fn(async (args: { data: { userId: string }[] }) =>
        args.data.map((d) => ({ userId: d.userId })),
      ),
    };
    const challenge = challengeExists ? { id: 'c', status } : null;
    const prisma = withLocks(
      {
        challenge: { findUnique: jest.fn().mockResolvedValue(challenge) },
        user: {
          findUnique: jest.fn(async (args: { where: { id: string } }) =>
            args.where.id === 'inactivo' ? { id: 'inactivo', active: false } : args.where.id === 'nadie' ? null : { id: args.where.id, active: true },
          ),
          findMany: jest.fn(async (args: { where: { id: { in: string[] } } }) =>
            args.where.id.in.map((id) => ({ id, name: id, email: id + '@x', active: true })),
          ),
        },
        challengeParticipant: {
          create: writes.participantCreate,
          findMany: jest.fn().mockResolvedValue([]),
          createManyAndReturn: writes.participantCreateMany,
        },
      } as unknown as PrismaService,
      async (id) => (challengeExists ? { id, status: lockedStatus } : null),
    );
    return { svc: challengesService(prisma), writes, prisma };
  }

  it('la inscripción individual rechaza a un usuario inactivo con 400, sin inscribirlo', async () => {
    const { svc, writes } = build(ChallengeStatus.ACTIVE);
    await expect(svc.addParticipant('c', 'inactivo')).rejects.toThrow(new BadRequestException('El usuario está inactivo'));
    expect(writes.participantCreate).not.toHaveBeenCalled();
  });

  it('el orden de la inscripción individual: 404 reto, 404 usuario, 400 inactivo, 400 cerrado', async () => {
    await expect(build(ChallengeStatus.ACTIVE, ChallengeStatus.ACTIVE, false).svc.addParticipant('c', 'inactivo')).rejects.toThrow('Reto no encontrado');
    await expect(build(ChallengeStatus.ACTIVE).svc.addParticipant('c', 'nadie')).rejects.toThrow('Usuario no encontrado');
    // cerrado e inactivo a la vez: gana el 400 de inactivo
    await expect(build(ChallengeStatus.COMPLETED).svc.addParticipant('c', 'inactivo')).rejects.toThrow('El usuario está inactivo');
    await expect(build(ChallengeStatus.COMPLETED).svc.addParticipant('c', 'u')).rejects.toThrow('No se puede modificar un reto cerrado');
  });

  it('la inscripción en bloque corre bajo el lock del reto y devuelve el resultado por usuario', async () => {
    const { svc, prisma, writes } = build(ChallengeStatus.ACTIVE);
    const result = await svc.bulkAddParticipants('c', [U1, U2]);
    expect(result.enrolled.map((r) => r.userId)).toEqual([U1, U2]);
    expect((prisma as unknown as { $transaction: jest.Mock }).$transaction).toHaveBeenCalledTimes(1);
    expect((prisma as unknown as { $queryRaw: jest.Mock }).$queryRaw).toHaveBeenCalled();
    expect(writes.participantCreateMany).toHaveBeenCalledTimes(1);
  });

  it('en bloque, un reto cerrado bajo el lock rechaza todo con 400 y no inserta', async () => {
    // el chequeo previo ve ACTIVE; el lock ve el reto ya cerrado
    const { svc, writes } = build(ChallengeStatus.ACTIVE, ChallengeStatus.COMPLETED);
    await expect(svc.bulkAddParticipants('c', [U1])).rejects.toThrow('No se puede modificar un reto cerrado');
    expect(writes.participantCreateMany).not.toHaveBeenCalled();
  });

  it('en bloque, un reto desconocido responde 404', async () => {
    const { svc, writes } = build(ChallengeStatus.ACTIVE, ChallengeStatus.ACTIVE, false);
    await expect(svc.bulkAddParticipants('c', [U1])).rejects.toThrow(NotFoundException);
    expect(writes.participantCreateMany).not.toHaveBeenCalled();
  });

  it('en bloque se puede inscribir en un borrador', async () => {
    const { svc } = build(ChallengeStatus.DRAFT);
    const result = await svc.bulkAddParticipants('c', [U1]);
    expect(result.enrolled).toHaveLength(1);
  });
});

describe('ChallengesService: paso único de cierre y sorteo guardado (closed-challenge-freeze)', () => {
  function build(status: ChallengeStatus, results: Record<string, unknown> = {}) {
    const writes = {
      challengeUpdate: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    };
    const challenge = { id: 'c', status, participants: [{ userId: 'a' }, { userId: 'b' }, { userId: 'c' }] };
    const prisma = withLocks({
      challenge: {
        findUnique: jest.fn().mockResolvedValue(challenge),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ ...challenge, status: ChallengeStatus.COMPLETED }),
        update: writes.challengeUpdate,
      },
      challengeParticipant: { findMany: jest.fn().mockResolvedValue(challenge.participants) },
      challengeAward: { deleteMany: writes.deleteMany, createMany: writes.createMany, findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService);
    const computeResults = jest.fn().mockResolvedValue({ drawNeeded: false, awards: [], winners: [], ...results });
    const svc = new ChallengesService(prisma, localUploads(), { computeResults } as unknown as ResultsService);
    return { svc, writes, computeResults, prisma };
  }
  const drawn = { drawNeeded: true, awards: [], winners: [{ userId: 'b' }, { userId: 'c' }] };

  it('cerrar con sorteo guarda a todos los ganadores con la nota reservada, calculando dentro de la transacción', async () => {
    const { svc, writes, computeResults, prisma } = build(ChallengeStatus.ACTIVE, drawn);
    await svc.close('c');
    expect(writes.challengeUpdate).toHaveBeenCalledWith({ where: { id: 'c' }, data: { status: ChallengeStatus.COMPLETED } });
    expect(computeResults).toHaveBeenCalledWith(prisma, 'c');
    expect(writes.createMany).toHaveBeenCalledWith({
      data: [
        { challengeId: 'c', userId: 'b', notes: 'Sorteo automático al cierre' },
        { challengeId: 'c', userId: 'c', notes: 'Sorteo automático al cierre' },
      ],
    });
  });

  it('cerrar sin sorteo no crea awards', async () => {
    const { svc, writes } = build(ChallengeStatus.ACTIVE, { winners: [{ userId: 'a' }] });
    await svc.close('c');
    expect(writes.createMany).not.toHaveBeenCalled();
  });

  it('cerrar un reto cerrado no cambia nada ni vuelve a sortear', async () => {
    const { svc, writes, computeResults } = build(ChallengeStatus.COMPLETED, drawn);
    await svc.close('c');
    expect(writes.challengeUpdate).not.toHaveBeenCalled();
    expect(computeResults).not.toHaveBeenCalled();
  });

  it('un borrador no se cierra ni se premia (400)', async () => {
    const { svc, writes } = build(ChallengeStatus.DRAFT);
    await expect(svc.close('c')).rejects.toThrow('Solo se puede cerrar un reto activo');
    await expect(svc.award('c', ['a'])).rejects.toThrow('Solo se puede cerrar un reto activo');
    expect(writes.challengeUpdate).not.toHaveBeenCalled();
    expect(writes.createMany).not.toHaveBeenCalled();
  });

  it('premiar un reto activo lo cierra con exactamente esas awards', async () => {
    const { svc, writes, computeResults } = build(ChallengeStatus.ACTIVE, drawn);
    await svc.award('c', ['a', 'b'], 'Premio entregado');
    expect(writes.challengeUpdate).toHaveBeenCalledTimes(1);
    expect(writes.deleteMany).toHaveBeenCalled();
    expect(writes.createMany).toHaveBeenCalledWith({
      data: [
        { challengeId: 'c', userId: 'a', notes: 'Premio entregado' },
        { challengeId: 'c', userId: 'b', notes: 'Premio entregado' },
      ],
    });
    expect(computeResults).not.toHaveBeenCalled();
  });

  it('premiar un reto cerrado reemplaza las awards sin volver a cerrarlo', async () => {
    const { svc, writes } = build(ChallengeStatus.COMPLETED);
    await svc.award('c', ['c']);
    expect(writes.challengeUpdate).not.toHaveBeenCalled();
    expect(writes.deleteMany).toHaveBeenCalled();
  });

  it('solo se premia a participantes, comprobado bajo el lock', async () => {
    const { svc, writes } = build(ChallengeStatus.ACTIVE);
    await expect(svc.award('c', ['a', 'zoe'])).rejects.toThrow('Solo se puede premiar a participantes del reto');
    expect(writes.deleteMany).not.toHaveBeenCalled();
  });

  it('un PATCH de cierre con otros campos se rechaza y solo el estado delega en el cierre', async () => {
    const { svc, writes, computeResults } = build(ChallengeStatus.ACTIVE, drawn);
    await expect(svc.update('c', { status: ChallengeStatus.COMPLETED, pointsPerKm: 5 })).rejects.toThrow(
      'Para cerrar el reto envía solo el estado',
    );
    expect(writes.challengeUpdate).not.toHaveBeenCalled();
    await svc.update('c', { status: ChallengeStatus.COMPLETED, name: undefined });
    expect(computeResults).toHaveBeenCalled();
    expect(writes.createMany).toHaveBeenCalled();
  });
});

describe('ChallengesService.closePreview (assisted-challenge-close)', () => {
  const participant = (userId: string, paid: boolean, amountPaid: string | null, proof = false) => ({
    userId,
    paid,
    amountPaid,
    paidAt: paid ? new Date('2026-05-02') : null,
    paymentProofUrl: proof ? `https://x/${userId}.pdf` : null,
    paymentProofUploadedAt: proof ? new Date('2026-05-03') : null,
    user: { id: userId, name: userId.toUpperCase(), email: `${userId}@x` },
  });
  function build(status: ChallengeStatus) {
    const challenge = {
      id: 'c',
      name: 'Reto',
      status,
      currency: 'BOB',
      feePerParticipant: '100.00',
      budgetTotal: null,
      participants: [
        participant('a', true, '100.00'),
        participant('b', false, null, true),
        participant('c', true, '50.00'),
        { ...participant('d', true, '50.00'), paymentProofUrl: 'https://x/d.pdf', paymentProofUploadedAt: new Date('2026-05-04') },
        { ...participant('e', true, '50.00', true), paymentProofUploadedAt: new Date('2026-05-01') },
      ],
    };
    const writes = { update: jest.fn(), createMany: jest.fn() };
    const prisma = {
      challenge: { findUnique: jest.fn().mockResolvedValue(challenge), update: writes.update },
      challengeAward: { createMany: writes.createMany },
      dailyActivity: {
        count: jest.fn().mockResolvedValue(3),
        findMany: jest.fn().mockResolvedValue([{ id: 'x', userId: 'a', date: new Date('2026-05-04'), user: { name: 'A' } }]),
      },
    } as unknown as PrismaService;
    const row = (userId: string, km: number) => ({ userId, name: userId.toUpperCase(), score: 1, totalKm: km });
    const previewSelection = jest.fn().mockResolvedValue({
      collected: 150,
      results: {},
      selection: { drawNeeded: true, guaranteed: [row('a', 30)], drawPool: [row('b', 20), row('c', 20)], drawSeats: 1, winners: [], notes: [] },
    });
    const svc = new ChallengesService(prisma, localUploads(), { previewSelection } as unknown as ResultsService);
    return { svc, writes };
  }

  it('reúne pendientes, comprobantes por revisar, impagos y la proyección', async () => {
    const { svc, writes } = build(ChallengeStatus.ACTIVE);
    const p = await svc.closePreview('c');
    expect(p.pendingActivities.count).toBe(3);
    expect(p.pendingActivities.items[0]).toMatchObject({ userId: 'a', userName: 'A' });
    // b: sin pago; d: pago parcial con comprobante posterior (payment-reconciliation). e: comprobante anterior al pago, no entra.
    expect(p.proofsToReview).toEqual([
      { userId: 'b', name: 'B', paymentProofUploadedAt: new Date('2026-05-03') },
      { userId: 'd', name: 'D', paymentProofUploadedAt: new Date('2026-05-04') },
    ]);
    expect(p.unpaid).toEqual([
      { userId: 'b', name: 'B', state: 'unpaid', amountPaid: 0 },
      { userId: 'c', name: 'C', state: 'partial', amountPaid: 50 },
      { userId: 'd', name: 'D', state: 'partial', amountPaid: 50 },
      { userId: 'e', name: 'E', state: 'partial', amountPaid: 50 },
    ]);
    expect(p).toMatchObject({ drawNeeded: true, drawSeats: 1, currency: 'BOB', feePerParticipant: 100 });
    expect(p.guaranteedWinners.map((w) => w.userId)).toEqual(['a']);
    expect(p.drawCandidates.map((w) => w.userId)).toEqual(['b', 'c']);
    expect(p.payout).toEqual({ pot: 150, winnersCount: 2, perWinner: 75, monetary: true });
    // Solo lectura
    expect(writes.update).not.toHaveBeenCalled();
    expect(writes.createMany).not.toHaveBeenCalled();
  });

  it('un borrador o un reto cerrado responden 400', async () => {
    await expect(build(ChallengeStatus.DRAFT).svc.closePreview('c')).rejects.toThrow('Solo se puede cerrar un reto activo');
    await expect(build(ChallengeStatus.COMPLETED).svc.closePreview('c')).rejects.toThrow('El reto ya está cerrado');
  });
});

describe('ChallengesService.uploadPaymentProof: comprobante reemplazado (upload-asset-cleanup)', () => {
  const proof = (name: string) => {
    const asset = ownedAsset({ challengeId: 'c', userId: 'u', purpose: 'payment-proof', name });
    return { paymentProofUrl: asset.url, paymentProofCloudinaryId: asset.cloudinaryId };
  };
  function build(flag: boolean, previousId: string | null) {
    const prisma = withLocks({
      challenge: { findUnique: jest.fn().mockResolvedValue({ id: 'c', status: ChallengeStatus.ACTIVE, feePerParticipant: '100' }) },
      challengeParticipant: {
        findUnique: jest.fn().mockResolvedValue({ id: 'p', paymentProofCloudinaryId: previousId }),
        update: jest.fn().mockResolvedValue({ id: 'p' }),
      },
    } as unknown as PrismaService);
    const uploads = localUploads();
    jest.spyOn(uploads, 'deleteReplacedProofs', 'get').mockReturnValue(flag);
    const later = jest.spyOn(uploads, 'deleteAssetsLater').mockResolvedValue(undefined);
    return { svc: new ChallengesService(prisma, uploads, new ResultsService(prisma)), later };
  }
  afterEach(() => jest.restoreAllMocks());

  it('por defecto conserva el comprobante anterior', async () => {
    const { svc, later } = build(false, proof('viejo').paymentProofCloudinaryId);
    await svc.uploadPaymentProof('c', 'u', proof('nuevo'));
    expect(later).not.toHaveBeenCalled();
  });

  it('con el borrado activado libera el anterior, y no si es el mismo archivo', async () => {
    const old = proof('viejo').paymentProofCloudinaryId;
    const on = build(true, old);
    await on.svc.uploadPaymentProof('c', 'u', proof('nuevo'));
    expect(on.later).toHaveBeenCalledWith([old]);
    const same = build(true, old);
    await same.svc.uploadPaymentProof('c', 'u', proof('viejo'));
    expect(same.later).not.toHaveBeenCalled();
  });
});

describe('ChallengesService.exportCsv (challenge-export)', () => {
  const member = (userId: string, name: string, paid: boolean, amountPaid: string | null) => ({
    userId,
    paid,
    amountPaid,
    paidAt: paid ? new Date('2026-05-02T10:00:00.000Z') : null,
    paymentProofUrl: `https://x/${userId}.pdf`,
    user: { id: userId, name, email: `${userId}@x` },
  });
  function build(status: ChallengeStatus, found = true) {
    const challenge = {
      id: 'c',
      name: 'Reto Mayo',
      month: 5,
      year: 2026,
      status,
      currency: 'BOB',
      feePerParticipant: '100.00',
      budgetTotal: null,
      participants: [member('a', 'Ana', true, '100.00'), member('b', '=Bruno', true, '40.00'), member('c', 'Carla', false, null)],
    };
    const write = jest.fn();
    const prisma = {
      challenge: { findUnique: jest.fn().mockResolvedValue(found ? challenge : null), update: write },
      challengeAward: { createMany: write },
    } as unknown as PrismaService;
    const rank = (userId: string, name: string, score: number) => ({
      userId,
      name,
      email: `${userId}@x`,
      validatedDays: score,
      pendingDays: 0,
      rejectedDays: 1,
      totalKm: 10,
      paid: true,
      score,
      qualified: true,
    });
    const getResults = jest.fn().mockResolvedValue({
      ranking: [rank('b', '=Bruno', 9), rank('a', 'Ana', 8), rank('c', 'Carla', 3)],
      awards: [{ userId: 'a', name: 'Ana', email: 'a@x', awardedAt: new Date(), notes: 'Sorteo automático al cierre' }],
      payout: { pot: 140, winnersCount: 1, perWinner: 140, monetary: true },
    });
    const svc = new ChallengesService(prisma, localUploads(), { getResults } as unknown as ResultsService);
    return { svc, write, getResults };
  }

  it('arma el acta en el orden del ranking con pagos, premiación guardada y premio', async () => {
    const { svc, write } = build(ChallengeStatus.COMPLETED);
    const { filename, content } = await svc.exportCsv('c');
    expect(filename).toBe('acta-reto-2026-05.csv');
    const [header, bruno, ana, carla] = content.split('\r\n');
    expect(header.startsWith('reto,periodo,moneda,cuota,pote,posicion,nombre,email')).toBe(true);
    // Texto con forma de fórmula neutralizado; no es ganador aunque encabece el ranking
    expect(bruno).toContain(",1,'=Bruno,");
    expect(bruno).toContain(',parcial,');
    expect(bruno).toContain(',40.00,2026-05-02,no,,');
    expect(ana).toContain(',2,Ana,');
    expect(ana).toContain(',pagado,100.00,2026-05-02,si,Sorteo automático al cierre,140.00');
    expect(carla).toContain(',pendiente,0.00,,no,,');
    expect(content).toContain('Reto Mayo,2026-05,BOB,100.00,140.00,');
    // No incluye enlaces de comprobantes ni escribe nada
    expect(content).not.toContain('https://x/');
    expect(write).not.toHaveBeenCalled();
  });

  it('un borrador, un reto activo o uno inexistente no se exportan', async () => {
    await expect(build(ChallengeStatus.DRAFT).svc.exportCsv('c')).rejects.toThrow('Solo se puede exportar el acta de un reto cerrado');
    await expect(build(ChallengeStatus.ACTIVE).svc.exportCsv('c')).rejects.toBeInstanceOf(BadRequestException);
    const missing = build(ChallengeStatus.COMPLETED, false);
    await expect(missing.svc.exportCsv('c')).rejects.toBeInstanceOf(NotFoundException);
    expect(missing.getResults).not.toHaveBeenCalled();
  });

  it('sin premiación guardada nadie figura como ganador ni lleva premio', async () => {
    const { svc, getResults } = build(ChallengeStatus.COMPLETED);
    getResults.mockResolvedValueOnce({
      ranking: [{ userId: 'a', name: 'Ana', email: 'a@x', validatedDays: 0, pendingDays: 0, rejectedDays: 0, totalKm: 0, paid: true, score: 0, qualified: false }],
      awards: [],
      payout: { pot: 0, winnersCount: 0, perWinner: 0, monetary: true },
    });
    const { content } = await svc.exportCsv('c');
    expect(content.split('\r\n')[1]).toContain(',no,,');
  });
});

describe('ChallengesService: renovación mensual (challenge-renewal)', () => {
  const U = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
  const people = [
    { id: U(1), name: 'Ana', email: 'ana@x', active: true },
    { id: U(2), name: 'Bea', email: 'bea@x', active: true },
    { id: U(3), name: 'Luis', email: 'luis@x', active: false },
  ];
  const sourceRow = (status: ChallengeStatus, month = 10, year = 2026) => ({
    id: 's',
    name: `Reto ${month}`,
    month,
    year,
    status,
    startDate: new Date(Date.UTC(year, month - 1, 1)),
    endDate: new Date(Date.UTC(year, month, 0)),
    validDays: [1, 2, 3],
    minHeartRateMinutes: 25,
    feePerParticipant: '150',
    budgetTotal: null as string | null,
    currency: 'USD',
    prizeDescription: 'Zapatillas',
    pointsPerValidatedDay: 2,
    pointsPerKm: '0.5',
    minValidatedDaysToQualify: 10,
    maxWinners: 3,
    tiebreakRule: 'TOTAL_KM',
    participants: people.map((user) => ({ userId: user.id, user })),
  });

  function build(
    opts: {
      source?: ReturnType<typeof sourceRow> | null;
      existing?: { id: string; name: string; status: ChallengeStatus } | null;
      createError?: unknown;
      enrollFails?: boolean;
    } = {},
  ) {
    const source = opts.source === undefined ? sourceRow(ChallengeStatus.ACTIVE) : opts.source;
    // con createError, el mes queda ocupado por "otra petición" que confirmó primero
    let raced = false;
    const create = jest.fn(async (args: { data: Record<string, unknown> }) => {
      if (opts.createError) {
        raced = true;
        throw opts.createError;
      }
      return { id: 'new', ...args.data };
    });
    const participantCreateMany = jest.fn(async (args: { data: { userId: string }[] }) => {
      if (opts.enrollFails) throw new Error('boom');
      return args.data.map((d) => ({ userId: d.userId }));
    });
    const findUnique = jest.fn(async (args: { where: { id?: string; month_year?: unknown } }) => {
      if (args.where.month_year) {
        if (raced) return { id: 'otro', name: 'Otro', status: ChallengeStatus.DRAFT };
        return opts.existing ?? null;
      }
      return source;
    });
    const update = jest.fn();
    const prisma = withLocks({
      challenge: { findUnique, create, update },
      user: { findMany: jest.fn(async () => people) },
      challengeParticipant: { findMany: jest.fn().mockResolvedValue([]), createManyAndReturn: participantCreateMany },
      challengeAward: { createMany: jest.fn() },
      dailyActivity: { createMany: jest.fn() },
    } as unknown as PrismaService);
    return { svc: challengesService(prisma), create, update, participantCreateMany, prisma };
  }

  describe('renewalPreview', () => {
    it('devuelve mes siguiente, período, reglas, a quién copiar y a quién omitir, sin escribir', async () => {
      const { svc, create, update, participantCreateMany } = build();
      const p = await svc.renewalPreview('s');
      expect(p.source).toEqual({ id: 's', name: 'Reto 10', month: 10, year: 2026, status: 'ACTIVE' });
      expect(p.target).toEqual({
        month: 11,
        year: 2026,
        name: 'Reto Noviembre 2026',
        startDate: '2026-11-01',
        endDate: '2026-11-30',
      });
      expect(p.rules.budgetMode).toBe('auto');
      expect(p.rules.validDays).toEqual([1, 2, 3]);
      expect(p.participants.toCopy).toEqual([
        { userId: U(1), name: 'Ana', email: 'ana@x' },
        { userId: U(2), name: 'Bea', email: 'bea@x' },
      ]);
      expect(p.participants.skipped).toEqual([
        { userId: U(3), name: 'Luis', email: 'luis@x', reason: 'INACTIVE', message: 'El usuario está inactivo' },
      ]);
      expect(p.existing).toBeNull();
      expect(create).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
      expect(participantCreateMany).not.toHaveBeenCalled();
    });

    it('marca el presupuesto manual y informa el reto que ya ocupa el mes', async () => {
      const source = { ...sourceRow(ChallengeStatus.COMPLETED, 12, 2026), budgetTotal: '600' };
      const { svc } = build({
        source,
        existing: { id: 'x', name: 'Reto Enero 2027', status: ChallengeStatus.DRAFT },
      });
      const p = await svc.renewalPreview('s');
      expect(p.rules.budgetMode).toBe('manual');
      expect(p.target).toMatchObject({ month: 1, year: 2027, startDate: '2027-01-01', endDate: '2027-01-31' });
      expect(p.existing).toEqual({ id: 'x', name: 'Reto Enero 2027', status: 'DRAFT' });
    });

    it('un borrador responde 400 y un reto desconocido 404', async () => {
      await expect(build({ source: sourceRow(ChallengeStatus.DRAFT) }).svc.renewalPreview('s')).rejects.toThrow(
        new BadRequestException('Solo se puede renovar un reto activo o cerrado'),
      );
      await expect(build({ source: null }).svc.renewalPreview('s')).rejects.toThrow(NotFoundException);
    });
  });

  describe('renew', () => {
    it('crea el borrador del mes siguiente con las reglas y el período, en una transacción, sin inscribir', async () => {
      const { svc, create, participantCreateMany, prisma } = build();
      const res = await svc.renew('s', {});
      expect((prisma as unknown as { $transaction: jest.Mock }).$transaction).toHaveBeenCalledTimes(1);
      expect(create).toHaveBeenCalledTimes(1);
      const data = create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        name: 'Reto Noviembre 2026',
        month: 11,
        year: 2026,
        status: ChallengeStatus.DRAFT,
        validDays: [1, 2, 3],
        minHeartRateMinutes: 25,
        currency: 'USD',
        prizeDescription: 'Zapatillas',
        maxWinners: 3,
        tiebreakRule: 'TOTAL_KM',
      });
      expect((data.startDate as Date).toISOString()).toBe('2026-11-01T00:00:00.000Z');
      expect((data.endDate as Date).toISOString()).toBe('2026-11-30T00:00:00.000Z');
      expect(data).not.toHaveProperty('id');
      expect(data).not.toHaveProperty('participants');
      expect(participantCreateMany).not.toHaveBeenCalled();
      expect(res.participants).toEqual({ enrolled: [], skipped: [] });
    });

    it('con copyParticipants inscribe a los activos en la misma transacción y reporta al inactivo', async () => {
      const { svc, participantCreateMany, prisma } = build();
      const res = await svc.renew('s', { copyParticipants: true });
      expect((prisma as unknown as { $transaction: jest.Mock }).$transaction).toHaveBeenCalledTimes(1);
      expect(participantCreateMany).toHaveBeenCalledTimes(1);
      const rows = participantCreateMany.mock.calls[0][0].data as Record<string, unknown>[];
      expect(rows.map((r) => r.userId)).toEqual([U(1), U(2)]);
      for (const r of rows) {
        expect(r.challengeId).toBe('new');
        expect(Object.keys(r).sort()).toEqual(['challengeId', 'userId']);
      }
      expect(res.participants.enrolled.map((e) => e.userId)).toEqual([U(1), U(2)]);
      expect(res.participants.skipped).toEqual([
        { userId: U(3), reason: 'INACTIVE', message: 'El usuario está inactivo' },
      ]);
    });

    it('el nombre propio se guarda recortado; el vacío usa el sugerido', async () => {
      const a = build();
      await a.svc.renew('s', { name: '  Reto Primavera  ' });
      expect(a.create.mock.calls[0][0].data.name).toBe('Reto Primavera');
      const b = build();
      await b.svc.renew('s', { name: '   ' });
      expect(b.create.mock.calls[0][0].data.name).toBe('Reto Noviembre 2026');
    });

    it('diciembre renueva en enero del año siguiente', async () => {
      const { svc, create } = build({ source: sourceRow(ChallengeStatus.COMPLETED, 12, 2026) });
      await svc.renew('s', {});
      expect(create.mock.calls[0][0].data).toMatchObject({ month: 1, year: 2027 });
    });

    it('si el mes ya existe responde 409 con existingChallengeId y no crea ni inscribe', async () => {
      const { svc, create, participantCreateMany } = build({
        existing: { id: 'ya', name: 'Reto Noviembre 2026', status: ChallengeStatus.DRAFT },
      });
      const err = await svc.renew('s', { copyParticipants: true }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect((err as ConflictException).getResponse()).toMatchObject({
        message: 'Ya existe un reto para 11/2026',
        existingChallengeId: 'ya',
      });
      expect(create).not.toHaveBeenCalled();
      expect(participantCreateMany).not.toHaveBeenCalled();
    });

    it('una carrera (P2002 al crear) responde el mismo 409 con el id del reto ganador', async () => {
      const createError = new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'x',
        meta: { target: ['month', 'year'] },
      });
      const { svc, participantCreateMany } = build({ createError });
      const err = await svc.renew('s', { copyParticipants: true }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect((err as ConflictException).getResponse()).toMatchObject({
        message: 'Ya existe un reto para 11/2026',
        existingChallengeId: 'otro',
      });
      expect(participantCreateMany).not.toHaveBeenCalled();
    });

    it('si falla la copia de inscritos, el error sale de la transacción (se revierte el reto)', async () => {
      const { svc, create } = build({ enrollFails: true });
      await expect(svc.renew('s', { copyParticipants: true })).rejects.toThrow('boom');
      expect(create).toHaveBeenCalledTimes(1);
    });

    it('nunca modifica el reto origen ni copia actividades ni premios', async () => {
      const { svc, update, prisma } = build({ source: sourceRow(ChallengeStatus.COMPLETED) });
      await svc.renew('s', { copyParticipants: true });
      expect(update).not.toHaveBeenCalled();
      const p = prisma as unknown as {
        challengeAward: { createMany: jest.Mock };
        dailyActivity: { createMany: jest.Mock };
      };
      expect(p.challengeAward.createMany).not.toHaveBeenCalled();
      expect(p.dailyActivity.createMany).not.toHaveBeenCalled();
    });

    it('un borrador responde 400 y nada se crea; un reto desconocido 404', async () => {
      const draft = build({ source: sourceRow(ChallengeStatus.DRAFT) });
      await expect(draft.svc.renew('s', {})).rejects.toThrow('Solo se puede renovar un reto activo o cerrado');
      expect(draft.create).not.toHaveBeenCalled();
      await expect(build({ source: null }).svc.renew('s', {})).rejects.toThrow(NotFoundException);
    });
  });
});
