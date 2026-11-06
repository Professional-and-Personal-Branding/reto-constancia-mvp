import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../auth.service';
import { matchesFingerprint } from '../password-fingerprint';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly refreshSecret: string;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
    this.refreshSecret = config.getOrThrow<string>('JWT_REFRESH_SECRET');
  }

  // Lo que retornes aquí queda en req.user. Passport ya verificó firma y vencimiento; aquí se
  // exige que el usuario exista y esté activo, que la huella de contraseña del token (pwv) coincida con
  // el hash vigente (un cambio de contraseña corta los access tokens anteriores) y se usa su rol vigente
  // (no el del token). El hash nunca sale de aquí.
  async validate(payload: JwtPayload): Promise<JwtPayload> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, active: true, passwordHash: true },
    });
    if (!user || !user.active) throw new UnauthorizedException('Sesión no válida');
    if (!matchesFingerprint(payload.pwv, user.passwordHash, this.refreshSecret)) {
      throw new UnauthorizedException('Sesión no válida');
    }
    return { sub: user.id, email: user.email, role: user.role };
  }
}
