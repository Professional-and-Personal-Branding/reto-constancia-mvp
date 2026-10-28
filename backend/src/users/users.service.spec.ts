import { BadRequestException, UnauthorizedException } from '@nestjs/common';
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
