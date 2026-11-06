import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { Prisma, User, UserRole } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { WRITER_TX } from '../challenges/challenge-lock';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { AuthService, AuthTokens } from '../auth/auth.service';
import { generateTemporaryPassword } from '../auth/password-policy';

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

  /**
   * Actualiza un usuario (admin). Reglas (spec user-administration): nadie se desactiva a sí mismo
   * y siempre queda un administrador activo. El cambio que quita a un admin activo corre en una
   * transacción que bloquea las filas de los admin activos, para que dos peticiones simultáneas
   * no puedan dejar la plataforma sin administrador.
   */
  async update(id: string, dto: UpdateUserDto, actorId: string): Promise<SafeUser> {
    const target = await this.findById(id); // valida que existe
    if (dto.active === false && id === actorId) {
      throw new BadRequestException('No puedes desactivar tu propia cuenta');
    }
    const data = {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.role !== undefined && { role: dto.role }),
      ...(dto.active !== undefined && { active: dto.active }),
    };

    const deactivates = dto.active === false;
    const demotes = dto.role !== undefined && dto.role !== UserRole.ADMIN;
    const removesActiveAdmin =
      target.role === UserRole.ADMIN && target.active && (deactivates || demotes);
    if (!removesActiveAdmin) {
      return this.prisma.user.update({ where: { id }, data, select: SAFE_USER_SELECT }) as Promise<SafeUser>;
    }

    return this.prisma.$transaction(
      async (tx) => {
        // SET no admite parámetros: el valor sale de una constante numérica.
        await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '${WRITER_TX.lockTimeoutMs}ms'`);
        const admins = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM "User" WHERE role = 'ADMIN' AND active = true FOR UPDATE`;
        if (!admins.some((a) => a.id !== id)) {
          throw new BadRequestException(
            deactivates
              ? 'No puedes desactivar al último administrador activo'
              : 'No puedes quitar el rol de administrador al último administrador activo',
          );
        }
        return tx.user.update({ where: { id }, data, select: SAFE_USER_SELECT }) as Promise<SafeUser>;
      },
      { maxWait: WRITER_TX.maxWait, timeout: WRITER_TX.timeout },
    );
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

  /**
   * Reinicia la contraseña de otro usuario (admin) y devuelve una temporal que se muestra una sola
   * vez. Solo se guarda el hash; la contraseña nunca va a logs ni a mensajes de error. Cambiar el
   * hash termina las sesiones del usuario en su próxima renovación (huella `pwv`). La línea de
   * auditoría lleva quién, a quién y el `requestId` que une con la línea de acceso.
   */
  async resetPasswordByAdmin(
    id: string,
    actorId: string,
    requestId: string | undefined,
  ): Promise<{ temporaryPassword: string }> {
    if (id === actorId) {
      throw new BadRequestException('Para cambiar tu propia contraseña usa Mi cuenta');
    }
    await this.findById(id);
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await argon2.hash(temporaryPassword);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
    new Logger('Audit').log(
      JSON.stringify({ event: 'admin_password_reset', requestId, actorId, targetId: id }),
    );
    return { temporaryPassword };
  }
}
