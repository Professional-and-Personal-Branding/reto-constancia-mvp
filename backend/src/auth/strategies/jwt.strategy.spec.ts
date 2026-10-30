import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { JwtStrategy } from './jwt.strategy';
import { PrismaService } from '../../prisma/prisma.service';
import { passwordFingerprint } from '../password-fingerprint';

describe('JwtStrategy (sesión vigente)', () => {
  const secret = 'secreto-de-prueba';
  const hash = '$argon2id$hash-vigente';
  const pwv = passwordFingerprint(hash, secret);
  let prisma: { user: { findUnique: jest.Mock } };
  let strategy: JwtStrategy;

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn() } };
    const config = { getOrThrow: () => secret } as unknown as ConfigService;
    strategy = new JwtStrategy(config, prisma as unknown as PrismaService);
  });

  it('validate devuelve sub, email y rol leídos de la base y no los del token', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'actual@x.com',
      role: 'PARTICIPANT',
      active: true,
      passwordHash: hash,
    });
    const res = await strategy.validate({ sub: 'u1', email: 'viejo@x.com', role: 'ADMIN', pwv });
    expect(res).toEqual({ sub: 'u1', email: 'actual@x.com', role: 'PARTICIPANT' });
  });

  it('validate busca por id y selecciona solo id, email, role, active y passwordHash', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@x.com', role: 'ADMIN', active: true, passwordHash: hash });
    await strategy.validate({ sub: 'u1', email: 'a@x.com', role: 'ADMIN', pwv });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'u1' },
      select: { id: true, email: true, role: true, active: true, passwordHash: true },
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

  it("validate: pwv que no coincide con el hash actual responde 401 'Sesión no válida'", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@x.com', role: 'PARTICIPANT', active: true, passwordHash: '$argon2id$hash-nuevo' });
    const err = await strategy.validate({ sub: 'u1', email: 'a@x.com', role: 'PARTICIPANT', pwv }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnauthorizedException);
    expect((err as Error).message).toBe('Sesión no válida');
  });

  it('validate: access token sin pwv responde 401', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@x.com', role: 'PARTICIPANT', active: true, passwordHash: hash });
    const err = await strategy.validate({ sub: 'u1', email: 'a@x.com', role: 'PARTICIPANT' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnauthorizedException);
    expect((err as Error).message).toBe('Sesión no válida');
  });

  it('validate no devuelve passwordHash', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@x.com', role: 'PARTICIPANT', active: true, passwordHash: hash });
    const res = await strategy.validate({ sub: 'u1', email: 'a@x.com', role: 'PARTICIPANT', pwv });
    expect(Object.keys(res).sort()).toEqual(['email', 'role', 'sub']);
    expect(JSON.stringify(res)).not.toContain(hash);
  });
});
