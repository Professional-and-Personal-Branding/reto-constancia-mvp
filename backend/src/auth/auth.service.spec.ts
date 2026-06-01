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
});
