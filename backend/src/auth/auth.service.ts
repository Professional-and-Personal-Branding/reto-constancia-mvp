import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { createHmac, timingSafeEqual } from 'crypto';
import { User, UserRole } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { jwtExpiresIn } from './jwt-expiry';
import { LoginDto } from './dto/login.dto';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
}

/** El refresh token lleva además la huella de la contraseña (`pwv`); el access token no. */
export interface RefreshPayload extends JwtPayload {
  pwv?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<{ user: SafeUser; tokens: AuthTokens }> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email ya registrado');

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash,
        role: UserRole.PARTICIPANT,
      },
    });

    return { user: this.sanitize(user), tokens: this.issueTokens(user) };
  }

  async login(dto: LoginDto): Promise<{ user: SafeUser; tokens: AuthTokens }> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !user.active) throw new UnauthorizedException('Credenciales inválidas');

    const ok = await argon2.verify(user.passwordHash, dto.password);
    if (!ok) throw new UnauthorizedException('Credenciales inválidas');

    return { user: this.sanitize(user), tokens: this.issueTokens(user) };
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    try {
      const payload = await this.jwt.verifyAsync<RefreshPayload>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || !user.active) throw new UnauthorizedException();
      // Un token sin huella (anterior a este cambio) o de antes del último cambio de contraseña no sirve.
      if (!this.matchesFingerprint(payload.pwv, user)) throw new UnauthorizedException();
      return this.issueTokens(user);
    } catch {
      throw new UnauthorizedException('Refresh token inválido');
    }
  }

  async getProfile(userId: string): Promise<SafeUser> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return this.sanitize(user);
  }

  issueTokens(user: User): AuthTokens {
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = this.jwt.sign(payload);
    const refreshPayload: RefreshPayload = { ...payload, pwv: this.passwordFingerprint(user) };
    const refreshToken = this.jwt.sign(refreshPayload, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: jwtExpiresIn(this.config.get<string>('JWT_REFRESH_EXPIRES_IN'), '7d', 'JWT_REFRESH_EXPIRES_IN'),
    });
    return { accessToken, refreshToken };
  }

  /** Huella del hash de la contraseña: HMAC con el secreto del refresh, 22 caracteres base64url. */
  private passwordFingerprint(user: User): string {
    return createHmac('sha256', this.config.getOrThrow<string>('JWT_REFRESH_SECRET'))
      .update(user.passwordHash)
      .digest('base64url')
      .slice(0, 22);
  }

  private matchesFingerprint(claim: unknown, user: User): boolean {
    if (typeof claim !== 'string') return false;
    const expected = Buffer.from(this.passwordFingerprint(user));
    const received = Buffer.from(claim);
    return received.length === expected.length && timingSafeEqual(received, expected);
  }

  private sanitize(user: User): SafeUser {
    const { passwordHash: _ph, ...safe } = user;
    return safe;
  }
}

export type SafeUser = Omit<User, 'passwordHash'>;
