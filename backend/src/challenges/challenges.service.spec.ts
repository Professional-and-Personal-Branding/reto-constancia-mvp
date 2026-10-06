import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ChallengeStatus } from '@prisma/client';

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
        user: { findUnique: jest.fn().mockResolvedValue({ id: 'u' }) },
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
      participants: [participant('a', true, '100.00'), participant('b', false, null, true), participant('c', true, '50.00')],
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
    expect(p.proofsToReview).toEqual([{ userId: 'b', name: 'B', paymentProofUploadedAt: new Date('2026-05-03') }]);
    expect(p.unpaid).toEqual([
      { userId: 'b', name: 'B', state: 'unpaid', amountPaid: 0 },
      { userId: 'c', name: 'C', state: 'partial', amountPaid: 50 },
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
