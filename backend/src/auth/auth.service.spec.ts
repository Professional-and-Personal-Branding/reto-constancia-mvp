import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';

import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuthService', () => {
  let prisma: {
    user: { findUnique: jest.Mock; create: jest.Mock };
  };
  let jwt: { sign: jest.Mock; verifyAsync: jest.Mock };
  let config: { get: jest.Mock; getOrThrow: jest.Mock };
  let service: AuthService;

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn(), create: jest.fn() } };
    jwt = { sign: jest.fn().mockReturnValue('token'), verifyAsync: jest.fn() };
    config = {
      get: jest.fn().mockReturnValue('7d'),
      getOrThrow: jest.fn().mockReturnValue('refresh-secret'),
    };
    service = new AuthService(
      prisma as unknown as PrismaService,
      jwt as unknown as JwtService,
      config as unknown as ConfigService,
    );
  });

  it('register crea usuario y no expone passwordHash', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'u1',
        role: 'PARTICIPANT',
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      }),
    );
    const res = await service.register({
      email: 'a@x.com',
      name: 'Ana',
      password: 'secret123',
    });
    expect(res.tokens.accessToken).toBe('token');
    expect((res.user as Record<string, unknown>).passwordHash).toBeUndefined();
  });

  it('register lanza ConflictException si el email ya existe', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
    await expect(
      service.register({ email: 'a@x.com', name: 'Ana', password: 'secret123' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('login válido devuelve tokens', async () => {
    const passwordHash = await argon2.hash('secret123');
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@x.com',
      name: 'Ana',
      role: 'PARTICIPANT',
      active: true,
      passwordHash,
    });
    const res = await service.login({ email: 'a@x.com', password: 'secret123' });
    expect(res.tokens.accessToken).toBe('token');
  });

  it('login con password incorrecto lanza Unauthorized', async () => {
    const passwordHash = await argon2.hash('secret123');
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      active: true,
      passwordHash,
    });
    await expect(
      service.login({ email: 'a@x.com', password: 'incorrecto' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('login de usuario inactivo lanza Unauthorized', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      active: false,
      passwordHash: 'x',
    });
    await expect(
      service.login({ email: 'a@x.com', password: 'secret123' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  describe('huella de la contraseña en el refresh token (pwv)', () => {
    const user = (passwordHash: string) => ({
      id: 'u1',
      email: 'a@x.com',
      name: 'Ana',
      role: 'PARTICIPANT',
      active: true,
      passwordHash,
    });

    const fingerprintOf = (passwordHash: string): string => {
      jwt.sign.mockClear();
      service.issueTokens(user(passwordHash) as never);
      return (jwt.sign.mock.calls[1] as [{ pwv: string }])[0].pwv;
    };

    it('el refresh token lleva pwv y el access token no', () => {
      service.issueTokens(user('hash-1') as never);
      const [accessPayload] = jwt.sign.mock.calls[0] as [Record<string, unknown>];
      const [refreshPayload] = jwt.sign.mock.calls[1] as [Record<string, unknown>];
      expect(accessPayload.pwv).toBeUndefined();
      expect(typeof refreshPayload.pwv).toBe('string');
      expect((refreshPayload.pwv as string).length).toBe(22);
    });

    it('la huella no es ni contiene el hash de la contraseña', () => {
      const hash = '$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA';
      const pwv = fingerprintOf(hash);
      expect(pwv).not.toBe(hash);
      expect(hash.includes(pwv)).toBe(false);
      expect(pwv.includes(hash)).toBe(false);
    });

    it('refresh acepta un token cuya huella coincide con el hash actual', async () => {
      const pwv = fingerprintOf('hash-1');
      jwt.verifyAsync.mockResolvedValue({ sub: 'u1', pwv });
      prisma.user.findUnique.mockResolvedValue(user('hash-1'));
      const res = await service.refresh('refresh-token');
      expect(res.accessToken).toBe('token');
    });

    it('refresh rechaza (401 Refresh token inválido) un token sin huella', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'u1' });
      prisma.user.findUnique.mockResolvedValue(user('hash-1'));
      await expect(service.refresh('refresh-token')).rejects.toThrow('Refresh token inválido');
    });

    it('refresh rechaza un token emitido antes del último cambio de contraseña', async () => {
      const pwv = fingerprintOf('hash-viejo');
      jwt.verifyAsync.mockResolvedValue({ sub: 'u1', pwv });
      prisma.user.findUnique.mockResolvedValue(user('hash-nuevo'));
      const err = await service.refresh('refresh-token').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(UnauthorizedException);
      expect((err as Error).message).toBe('Refresh token inválido');
    });
  });
});
