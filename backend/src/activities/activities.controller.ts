import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { ActivitiesService } from './activities.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { QueryActivitiesDto } from './dto/query-activities.dto';
import { RejectActivityDto } from './dto/reject-activity.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';

@ApiTags('activities')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('activities')
export class ActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}

  @Post()
  @ApiOperation({ summary: 'Registrar actividad del día (participante)' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateActivityDto) {
    return this.activities.create(user.sub, dto);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Listar actividades con filtros (admin)' })
  findAll(@Query() filter: QueryActivitiesDto) {
    return this.activities.findAll(filter);
  }

  @Get('me')
  @ApiOperation({ summary: 'Mis actividades' })
  findMine(
    @CurrentUser() user: JwtPayload,
    @Query('challengeId') challengeId?: string,
  ) {
    return this.activities.findMine(user.sub, challengeId);
  }

  @Get('pending')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Actividades pendientes de validación' })
  findPending(@Query('challengeId') challengeId?: string) {
    return this.activities.findPending(challengeId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una actividad' })
  findOne(@Param('id') id: string) {
    return this.activities.findOne(id);
  }

  @Post(':id/validate')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Validar actividad (admin)' })
  validate(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.activities.validate(id, user.sub);
  }

  @Post(':id/reject')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Rechazar actividad (admin)' })
  reject(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: RejectActivityDto,
  ) {
    return this.activities.reject(id, user.sub, dto.reason);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar actividad (propia si pendiente, o admin)' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    await this.activities.remove(id, user.sub, user.role);
  }
}
