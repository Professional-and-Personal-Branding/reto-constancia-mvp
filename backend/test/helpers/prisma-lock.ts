/**
 * Soporte de transacciones interactivas y del lock del reto para los mocks de Prisma de las
 * pruebas unitarias (cambio closed-challenge-freeze). La transacción corre sobre el mismo mock,
 * y el `SELECT ... FOR SHARE/UPDATE` devuelve el estado del reto que expone el mock.
 */
type ChallengeLookup = (id: string) => Promise<{ id?: string; status?: string } | null | undefined>;

export function withLocks<T extends object>(prisma: T, lookup?: ChallengeLookup): T {
  const mock = prisma as T & Record<string, unknown>;
  const findChallenge: ChallengeLookup =
    lookup ??
    (async (id) => {
      const challenge = (mock as { challenge?: { findUnique?: (args: unknown) => Promise<unknown> } }).challenge;
      return (await challenge?.findUnique?.({ where: { id } })) as { status?: string } | null;
    });
  Object.assign(mock, {
    $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(mock)),
    $executeRawUnsafe: jest.fn().mockResolvedValue(0),
    $queryRaw: jest.fn(async (_strings: TemplateStringsArray, id: string) => {
      const challenge = await findChallenge(id);
      return challenge ? [{ id, status: challenge.status ?? 'ACTIVE' }] : [];
    }),
  });
  return mock;
}
