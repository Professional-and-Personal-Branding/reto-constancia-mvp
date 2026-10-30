import { BadRequestException, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';

import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';

// argon2 es un módulo nativo no configurable: se envuelve para poder contar las llamadas.
jest.mock('argon2', () => {
  const actual = jest.requireActual<typeof import('argon2')>('argon2');
  return { ...actual, verify: jest.fn(actual.verify), hash: jest.fn(actual.hash) };
});

describe('UsersService (Mi cuenta)', () => {
  let prisma: { user: { findUnique: jest.Mock; update: jest.Mock } };
  let auth: { issueTokens: jest.Mock };
  let service: UsersService;
  const verifySpy = argon2.verify as unknown as jest.Mock;
  const hashSpy = argon2.hash as unknown as jest.Mock;

  const stored = (passwordHash: string, active = true) => ({
    id: 'u1',
    email: 'a@x.com',
    name: 'Ana',
    role: 'PARTICIPANT',
    active,
    passwordHash,
  });

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn(), update: jest.fn() } };
    auth = { issueTokens: jest.fn().mockReturnValue({ accessToken: 'a', refreshToken: 'r' }) };
    service = new UsersService(prisma as unknown as PrismaService, auth as unknown as AuthService);
    verifySpy.mockClear();
    hashSpy.mockClear();
  });

  it('updateMe recorta el nombre, guarda solo name y no devuelve passwordHash', async () => {
    prisma.user.update.mockImplementation(async ({ data }: { data: { name: string } }) => ({
      id: 'u1',
      email: 'a@x.com',
      role: 'PARTICIPANT',
      active: true,
      ...data,
    }));
    const res = await service.updateMe('u1', { name: '  Ana María ' });
    const call = prisma.user.update.mock.calls[0][0] as {
      where: { id: string };
      data: Record<string, unknown>;
      select: Record<string, boolean>;
    };
    expect(call.where).toEqual({ id: 'u1' });
    expect(call.data).toEqual({ name: 'Ana María' });
    expect(call.select.passwordHash).toBeUndefined();
    expect(res.name).toBe('Ana María');
    expect((res as unknown as Record<string, unknown>).passwordHash).toBeUndefined();
  });

  it('changePassword: usuario ausente o inactivo responde 401', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.changePassword('u1', { currentPassword: 'Actual123', newPassword: 'Nuev0Pass2' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    prisma.user.findUnique.mockResolvedValueOnce(stored('x', false));
    await expect(
      service.changePassword('u1', { currentPassword: 'Actual123', newPassword: 'Nuev0Pass2' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('changePassword: contraseñas iguales responde 400 sin llamar a argon2', async () => {
    prisma.user.findUnique.mockResolvedValue(stored('x'));
    const err = await service
      .changePassword('u1', { currentPassword: 'Misma1234', newPassword: 'Misma1234' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as Error).message).toBe('La nueva contraseña debe ser distinta de la actual');
    expect(verifySpy).not.toHaveBeenCalled();
    expect(hashSpy).not.toHaveBeenCalled();
  });

  it('changePassword: contraseña actual incorrecta responde 400 y no actualiza', async () => {
    prisma.user.findUnique.mockResolvedValue(stored(await argon2.hash('Actual123')));
    const err = await service
      .changePassword('u1', { currentPassword: 'Equivocada1', newPassword: 'Nuev0Pass2' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as Error).message).toBe('Contraseña actual incorrecta');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('changePassword: guarda el hash nuevo y devuelve un par de tokens nuevo', async () => {
    prisma.user.findUnique.mockResolvedValue(stored(await argon2.hash('Actual123')));
    prisma.user.update.mockImplementation(async ({ data }: { data: { passwordHash: string } }) => ({
      ...stored(data.passwordHash),
    }));
    const tokens = await service.changePassword('u1', {
      currentPassword: 'Actual123',
      newPassword: 'Nuev0Pass2',
    });
    const saved = (prisma.user.update.mock.calls[0][0] as { data: { passwordHash: string } }).data.passwordHash;
    expect(await argon2.verify(saved, 'Nuev0Pass2')).toBe(true);
    expect(auth.issueTokens).toHaveBeenCalledWith(expect.objectContaining({ passwordHash: saved }));
    expect(tokens).toEqual({ accessToken: 'a', refreshToken: 'r' });
  });
});

describe('UsersService.update (sesión efectiva y último admin)', () => {
  let tx: { $executeRawUnsafe: jest.Mock; $queryRaw: jest.Mock; user: { update: jest.Mock } };
  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
  };
  let service: UsersService;
  const order: string[] = [];

  const target = (role: string, active = true) => ({ id: 't1', email: 't@x.com', name: 'T', role, active });

  beforeEach(() => {
    order.length = 0;
    tx = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(0),
      $queryRaw: jest.fn().mockImplementation(async () => {
        order.push('lock');
        return [{ id: 't1' }, { id: 'otro' }];
      }),
      user: {
        update: jest.fn().mockImplementation(async () => {
          order.push('update');
          return target('PARTICIPANT');
        }),
      },
    };
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue(target('ADMIN')) },
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    service = new UsersService(prisma as unknown as PrismaService, {} as unknown as AuthService);
  });

  it('update: desactivar la propia cuenta responde 400 y no escribe', async () => {
    prisma.user.findUnique.mockResolvedValue(target('ADMIN'));
    const err = await service.update('t1', { active: false }, 't1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as Error).message).toBe('No puedes desactivar tu propia cuenta');
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('update: desactivar al único admin activo (distinto del actor) responde 400 y no escribe', async () => {
    prisma.user.findUnique.mockResolvedValue(target('ADMIN'));
    tx.$queryRaw.mockResolvedValue([{ id: 't1' }]);
    const err = await service.update('t1', { active: false }, 'a1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as Error).message).toBe('No puedes desactivar al último administrador activo');
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('update: quitar el rol al único admin activo responde 400 y no escribe', async () => {
    prisma.user.findUnique.mockResolvedValue(target('ADMIN'));
    tx.$queryRaw.mockResolvedValue([{ id: 't1' }]);
    const err = await service.update('t1', { role: 'PARTICIPANT' }, 't1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as Error).message).toBe(
      'No puedes quitar el rol de administrador al último administrador activo',
    );
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('update: con dos admins activos la degradación corre dentro de la transacción tras el FOR UPDATE', async () => {
    prisma.user.findUnique.mockResolvedValue(target('ADMIN'));
    await service.update('t1', { role: 'PARTICIPANT' }, 'a1');
    expect(order).toEqual(['lock', 'update']);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(expect.stringContaining('lock_timeout'));
  });

  it('update: nombre, promoción y reactivación no abren la transacción con bloqueo', async () => {
    prisma.user.findUnique.mockResolvedValue(target('ADMIN'));
    await service.update('t1', { name: 'Nuevo' }, 'a1');
    prisma.user.findUnique.mockResolvedValue(target('PARTICIPANT'));
    await service.update('t1', { role: 'ADMIN' }, 'a1');
    prisma.user.findUnique.mockResolvedValue(target('ADMIN', false));
    await service.update('t1', { active: true }, 'a1');
    await service.update('t1', { role: 'PARTICIPANT' }, 'a1'); // admin inactivo: no quita un activo
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledTimes(4);
  });
});

describe('UsersService.resetPasswordByAdmin', () => {
  let prisma: { user: { findUnique: jest.Mock; update: jest.Mock } };
  let service: UsersService;
  const hashSpy = argon2.hash as unknown as jest.Mock;

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) } };
    service = new UsersService(prisma as unknown as PrismaService, {} as unknown as AuthService);
    hashSpy.mockClear();
  });

  it('resetPasswordByAdmin rechaza el propio id con 400 sin buscar ni escribir', async () => {
    await expect(service.resetPasswordByAdmin('admin1', 'admin1', 'req-1')).rejects.toThrow(
      new BadRequestException('Para cambiar tu propia contraseña usa Mi cuenta'),
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('resetPasswordByAdmin responde 404 si el usuario no existe', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.resetPasswordByAdmin('nadie', 'admin1', 'req-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('resetPasswordByAdmin guarda solo el hash nuevo y devuelve la contraseña temporal', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
    const result = await service.resetPasswordByAdmin('u1', 'admin1', 'req-1');
    expect(Object.keys(result)).toEqual(['temporaryPassword']);
    expect(result.temporaryPassword).toMatch(/^[A-Za-z0-9]{4}(-[A-Za-z0-9]{4}){2}$/);
    const call = prisma.user.update.mock.calls[0][0] as {
      where: { id: string };
      data: { passwordHash: string };
    };
    expect(call.where).toEqual({ id: 'u1' });
    expect(Object.keys(call.data)).toEqual(['passwordHash']);
    expect(call.data.passwordHash).not.toContain(result.temporaryPassword);
    expect(await argon2.verify(call.data.passwordHash, result.temporaryPassword)).toBe(true);
  });

  it('resetPasswordByAdmin escribe la línea de auditoría sin la contraseña', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    try {
      const { temporaryPassword } = await service.resetPasswordByAdmin('u1', 'admin1', 'req-9');
      expect(log).toHaveBeenCalledTimes(1);
      const line = log.mock.calls[0][0] as string;
      expect(JSON.parse(line)).toEqual({
        event: 'admin_password_reset',
        requestId: 'req-9',
        actorId: 'admin1',
        targetId: 'u1',
      });
      expect(line).not.toContain(temporaryPassword);
    } finally {
      log.mockRestore();
    }
  });
});
