import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';

import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthTokens, JwtPayload } from '../auth/auth.service';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Listar todos los usuarios (admin)' })
  findAll() {
    return this.users.findAll();
  }

  @Get(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Detalle de un usuario (admin)' })
  findOne(@Param('id') id: string) {
    return this.users.findById(id);
  }

  // Declarada antes de `PATCH :id` para que `me` no se tome como un id.
  @Patch('me')
  @ApiOperation({ summary: 'Cambiar mi nombre' })
  updateMe(@CurrentUser() user: JwtPayload, @Body() dto: UpdateMeDto) {
    return this.users.updateMe(user.sub, dto);
  }

  // Mismo límite que el login: 5 intentos por minuto por IP.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Patch('me/password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cambiar mi propia contraseña',
    description:
      'Devuelve un par de tokens nuevo para esta sesión; las demás sesiones dejan de renovarse. ' +
      '400 si la contraseña actual es incorrecta, la nueva incumple la regla o es igual a la actual.',
  })
  changeMyPassword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChangePasswordDto,
  ): Promise<AuthTokens> {
    return this.users.changePassword(user.sub, dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Actualizar usuario (admin)',
    description:
      'Rol, estado y nombre. 400 si el admin intenta desactivar su propia cuenta ' +
      '("No puedes desactivar tu propia cuenta"), desactivar al último administrador activo ' +
      '("No puedes desactivar al último administrador activo") o quitarle el rol ' +
      '("No puedes quitar el rol de administrador al último administrador activo").',
  })
  update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(id, dto, user.sub);
  }
}
