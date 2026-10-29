import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { JwtStrategy } from './jwt.strategy';
import { PrismaService } from '../../prisma/prisma.service';

describe('JwtStrategy (sesión vigente)', () => {
  let prisma: { user: { findUnique: jest.Mock } };
  let strategy: JwtStrategy;

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn() } };
    const config = { getOrThrow: () => 'secreto-de-prueba' } as unknown as ConfigService;
    strategy = new JwtStrategy(config, prisma as unknown as PrismaService);
  });

  it('validate devuelve sub, email y rol leídos de la base y no los del token', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'actual@x.com',
      role: 'PARTICIPANT',
      active: true,
    });
    const res = await strategy.validate({ sub: 'u1', email: 'viejo@x.com', role: 'ADMIN' });
    expect(res).toEqual({ sub: 'u1', email: 'actual@x.com', role: 'PARTICIPANT' });
  });

  it('validate busca por id y selecciona solo id, email, role y active', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@x.com', role: 'ADMIN', active: true });
    await strategy.validate({ sub: 'u1', email: 'a@x.com', role: 'ADMIN' });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'u1' },
      select: { id: true, email: true, role: true, active: true },
    });
  });

  it('validate: usuario inexistente responde 401 "Sesión no válida"', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const err = await strategy.validate({ sub: 'x', email: 'a@x.com', role: 'ADMIN' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnauthorizedException);
    expect((err as Error).message).toBe('Sesión no válida');
  });

  it('validate: usuario inactivo responde 401 "Sesión no válida"', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@x.com', role: 'PARTICIPANT', active: false });
    const err = await strategy.validate({ sub: 'u1', email: 'a@x.com', role: 'PARTICIPANT' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnauthorizedException);
    expect((err as Error).message).toBe('Sesión no válida');
  });
});
