import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { isLockTimeout, LOCK_CONFLICT_MESSAGE, lockChallenge, withChallengeLock } from './challenge-lock';
import { PrismaService } from '../prisma/prisma.service';

const known = (code: string, message = 'x') =>
  new Prisma.PrismaClientKnownRequestError(message, { code, clientVersion: '5.22.0' });

describe('isLockTimeout', () => {
  it('reconoce el timeout de la transacción y el lock_timeout de Postgres', () => {
    expect(isLockTimeout(known('P2028'))).toBe(true);
    expect(isLockTimeout(known('P2010', 'Raw query failed. Code: `55P03`. Message: `canceling statement due to lock timeout`'))).toBe(true);
    expect(isLockTimeout(new Prisma.PrismaClientUnknownRequestError('ERROR: canceling statement due to lock timeout (55P03)', { clientVersion: '5.22.0' }))).toBe(true);
  });

  it('no confunde otros errores con un timeout de lock', () => {
    expect(isLockTimeout(known('P2002'))).toBe(false);
    expect(isLockTimeout(known('P2010', 'syntax error'))).toBe(false);
    expect(isLockTimeout(new Error('lock timeout'))).toBe(false);
  });
});

describe('withChallengeLock', () => {
  it('traduce un timeout de lock a 409 con mensaje legible', async () => {
    const prisma = { $transaction: jest.fn().mockRejectedValue(known('P2028')) } as unknown as PrismaService;
    await expect(withChallengeLock(prisma, async () => 1)).rejects.toThrow(new ConflictException(LOCK_CONFLICT_MESSAGE));
  });

  it('deja pasar los demás errores y el resultado', async () => {
    const boom = new Error('otra cosa');
    const failing = { $transaction: jest.fn().mockRejectedValue(boom) } as unknown as PrismaService;
    await expect(withChallengeLock(failing, async () => 1)).rejects.toBe(boom);
    const ok = { $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn({})) } as unknown as PrismaService;
    await expect(withChallengeLock(ok, async () => 42)).resolves.toBe(42);
  });

  it('usa los tiempos de espera de las escrituras por defecto', async () => {
    const $transaction = jest.fn((fn: (tx: unknown) => unknown) => fn({}));
    await withChallengeLock({ $transaction } as unknown as PrismaService, async () => 1);
    expect($transaction).toHaveBeenCalledWith(expect.any(Function), { maxWait: 5_000, timeout: 10_000 });
  });
});

describe('lockChallenge', () => {
  function tx(rows: unknown[]) {
    return {
      $executeRawUnsafe: jest.fn().mockResolvedValue(0),
      $queryRaw: jest.fn().mockResolvedValue(rows),
    } as unknown as Prisma.TransactionClient & { $executeRawUnsafe: jest.Mock; $queryRaw: jest.Mock };
  }

  it('fija el lock_timeout y bloquea la fila en modo compartido o exclusivo', async () => {
    const t = tx([{ id: 'c1', status: 'ACTIVE' }]);
    await expect(lockChallenge(t, 'c1')).resolves.toEqual({ id: 'c1', status: 'ACTIVE' });
    expect(t.$executeRawUnsafe).toHaveBeenCalledWith("SET LOCAL lock_timeout = '5000ms'");
    expect((t.$queryRaw.mock.calls[0][0] as string[]).join('?')).toMatch(/FROM "Challenge" WHERE id = \? FOR SHARE/);

    const u = tx([{ id: 'c1', status: 'ACTIVE' }]);
    await lockChallenge(u, 'c1', 'update', 10_000);
    expect(u.$executeRawUnsafe).toHaveBeenCalledWith("SET LOCAL lock_timeout = '10000ms'");
    expect((u.$queryRaw.mock.calls[0][0] as string[]).join('?')).toMatch(/FOR UPDATE/);
  });

  it('un reto inexistente da 404', async () => {
    await expect(lockChallenge(tx([]), 'nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});
