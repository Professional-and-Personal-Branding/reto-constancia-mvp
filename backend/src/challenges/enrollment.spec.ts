import { Prisma } from '@prisma/client';

import { enrollMany } from './enrollment';

type UserRow = { id: string; name: string; email: string; active: boolean };

const U = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const user = (n: number, active = true): UserRow => ({
  id: U(n),
  name: `Usuario ${n}`,
  email: `u${n}@x`,
  active,
});
const row = (n: number) => ({ userId: U(n), name: `Usuario ${n}`, email: `u${n}@x` });

/** Cliente transaccional falso: usuarios existentes, ya inscritos y filas insertadas. */
function fakeTx(users: UserRow[], enrolledIds: string[] = [], raced: string[] = []) {
  const createMany = jest.fn(async (args: { data: { userId: string }[]; skipDuplicates?: boolean }) => ({
    count: args.data.filter((d) => !raced.includes(d.userId)).length,
  }));
  const tx = {
    user: {
      findMany: jest.fn(async (args: { where: { id: { in: string[] } } }) =>
        users.filter((u) => args.where.id.in.includes(u.id)),
      ),
    },
    challengeParticipant: {
      findMany: jest.fn(async (args: { where: { userId: { in: string[] }; joinedAt?: Date } }) => {
        if (args.where.joinedAt) {
          // relectura tras una carrera: solo las filas de esta llamada
          const ours = createMany.mock.calls[0][0].data.filter((d) => !raced.includes(d.userId));
          return ours.map((d) => ({ userId: d.userId }));
        }
        return args.where.userId.in.filter((id) => enrolledIds.includes(id)).map((userId) => ({ userId }));
      }),
      createMany,
    },
  };
  return { tx: tx as unknown as Prisma.TransactionClient, createMany };
}

describe('enrollMany (regla de inscripción compartida)', () => {
  it('reparte un grupo mixto: nuevos, ya inscritos, inactivo y desconocido', async () => {
    const { tx, createMany } = fakeTx([user(1), user(2), user(3), user(4, false)], [U(1)]);
    const result = await enrollMany(tx, 'c', [U(1), U(2), U(3), U(4), U(9)]);
    expect(result.enrolled).toEqual([row(2), row(3)]);
    expect(result.alreadyEnrolled).toEqual([row(1)]);
    expect(result.skipped).toEqual([
      { userId: U(4), reason: 'INACTIVE', message: 'El usuario está inactivo' },
      { userId: U(9), reason: 'NOT_FOUND', message: 'Usuario no encontrado' },
    ]);
    expect(createMany).toHaveBeenCalledTimes(1);
    expect(createMany.mock.calls[0][0]).toMatchObject({ skipDuplicates: true });
  });

  it('los ids repetidos cuentan una sola vez y cada id aparece en una sola lista', async () => {
    const { tx, createMany } = fakeTx([user(1), user(2)], [U(2)]);
    const ids = [U(1), U(1), U(2), U(2), U(9), U(9)];
    const result = await enrollMany(tx, 'c', ids);
    expect(result.enrolled).toEqual([row(1)]);
    expect(result.alreadyEnrolled).toEqual([row(2)]);
    expect(result.skipped).toHaveLength(1);
    const all = [
      ...result.enrolled.map((r) => r.userId),
      ...result.alreadyEnrolled.map((r) => r.userId),
      ...result.skipped.map((r) => r.userId),
    ];
    expect(all.sort()).toEqual([...new Set(ids)].sort());
    expect(createMany.mock.calls[0][0].data).toHaveLength(1);
  });

  it('las filas insertadas no traen datos de pago', async () => {
    const { tx, createMany } = fakeTx([user(1), user(2)]);
    await enrollMany(tx, 'reto-1', [U(1), U(2)]);
    const data = createMany.mock.calls[0][0].data as unknown as Record<string, unknown>[];
    expect(data.map((d) => d.userId)).toEqual([U(1), U(2)]);
    for (const d of data) {
      expect(d.challengeId).toBe('reto-1');
      for (const key of ['paid', 'paidAt', 'amountPaid', 'paymentProofUrl', 'paymentProofCloudinaryId']) {
        expect(d).not.toHaveProperty(key);
      }
    }
  });

  it('sin nadie que inscribir no inserta nada', async () => {
    const { tx, createMany } = fakeTx([user(1, false)], []);
    const result = await enrollMany(tx, 'c', [U(1), U(9)]);
    expect(result.enrolled).toEqual([]);
    expect(createMany).not.toHaveBeenCalled();
  });

  it('un usuario inscrito en paralelo queda como ya inscrito, nunca en las dos listas', async () => {
    const { tx } = fakeTx([user(1), user(2)], [], [U(2)]);
    const result = await enrollMany(tx, 'c', [U(1), U(2)]);
    expect(result.enrolled).toEqual([row(1)]);
    expect(result.alreadyEnrolled).toEqual([row(2)]);
    expect(result.skipped).toEqual([]);
  });
});
