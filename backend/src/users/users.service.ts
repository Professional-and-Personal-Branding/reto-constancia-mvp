import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { Prisma, User, UserRole } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { AuthService, AuthTokens } from '../auth/auth.service';

export type SafeUser = Omit<User, 'passwordHash'>;

const SAFE_USER_SELECT: Prisma.UserSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  active: true,
  createdAt: true,
  updatedAt: true,
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  findAll(): Promise<SafeUser[]> {
    return this.prisma.user.findMany({
      select: SAFE_USER_SELECT,
      orderBy: { createdAt: 'asc' },
    }) as Promise<SafeUser[]>;
  }

  async findById(id: string): Promise<SafeUser> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: SAFE_USER_SELECT,
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user as SafeUser;
  }

  async update(id: string, dto: UpdateUserDto): Promise<SafeUser> {
    await this.findById(id); // valida que existe
    return this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.role !== undefined && { role: dto.role }),
        ...(dto.active !== undefined && { active: dto.active }),
      },
      select: SAFE_USER_SELECT,
    }) as Promise<SafeUser>;
  }

  /** Cambia solo el nombre de la propia persona (nunca rol, estado ni correo). */
  async updateMe(userId: string, dto: UpdateMeDto): Promise<SafeUser> {
    return this.prisma.user.update({
      where: { id: userId },
      data: { name: dto.name.trim() },
      select: SAFE_USER_SELECT,
    }) as Promise<SafeUser>;
  }

  /**
   * Cambia la contraseña y devuelve un par de tokens nuevo para la sesión que lo pidió:
   * la huella del refresh cambia con el hash y las demás sesiones dejan de renovarse.
   * Una contraseña actual incorrecta es 400 (error de formulario), no 401 (sin sesión).
   */
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<AuthTokens> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.active) throw new UnauthorizedException('Sesión no válida');

    if (dto.newPassword === dto.currentPassword) {
      throw new BadRequestException('La nueva contraseña debe ser distinta de la actual');
    }
    const ok = await argon2.verify(user.passwordHash, dto.currentPassword);
    if (!ok) throw new BadRequestException('Contraseña actual incorrecta');

    const passwordHash = await argon2.hash(dto.newPassword);
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
    return this.auth.issueTokens(updated);
  }

  async resetPassword(id: string, newPassword: string): Promise<void> {
    await this.findById(id);
    const passwordHash = await argon2.hash(newPassword);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
  }

  async setActive(id: string, active: boolean): Promise<SafeUser> {
    return this.update(id, { active });
  }

  async setRole(id: string, role: UserRole): Promise<SafeUser> {
    return this.update(id, { role });
  }
}
