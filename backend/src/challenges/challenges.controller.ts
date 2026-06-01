import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ChallengeStatus, UserRole } from '@prisma/client';

import { ChallengesService } from './challenges.service';
import { ResultsService } from './results.service';
import { CreateChallengeDto } from './dto/create-challenge.dto';
import { UpdateChallengeDto } from './dto/update-challenge.dto';
import { AddParticipantDto } from './dto/add-participant.dto';
import { MarkPaymentDto } from './dto/mark-payment.dto';
import { PaymentProofDto } from './dto/payment-proof.dto';
import { AwardChallengeDto } from './dto/award-challenge.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';

@ApiTags('challenges')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('challenges')
export class ChallengesController {
  constructor(
    private readonly challenges: ChallengesService,
    private readonly results: ResultsService,
  ) {}

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Crear nuevo reto (admin)' })
  create(@Body() dto: CreateChallengeDto) {
    return this.challenges.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar todos los retos' })
  findAll() {
    return this.challenges.findAll();
  }

  @Get('active')
  @ApiOperation({ summary: 'Reto activo actual' })
  findActive() {
    return this.challenges.findActive();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un reto' })
  findOne(@Param('id') id: string) {
    return this.challenges.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Actualizar reto (admin)' })
  update(@Param('id') id: string, @Body() dto: UpdateChallengeDto) {
    return this.challenges.update(id, dto);
  }

  @Post(':id/close')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Cerrar reto (admin)' })
  close(@Param('id') id: string) {
    return this.challenges.update(id, { status: ChallengeStatus.COMPLETED });
  }

  @Post(':id/activate')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Activar reto (admin)' })
  activate(@Param('id') id: string) {
    return this.challenges.update(id, { status: ChallengeStatus.ACTIVE });
  }

  @Get(':id/results')
  @ApiOperation({
    summary: 'Ranking, ganadores y resumen del reto',
  })
  getResults(@Param('id') id: string) {
    return this.results.getResults(id);
  }

  @Post(':id/awards')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Registrar ganadores premiados del reto (admin)' })
  award(@Param('id') id: string, @Body() dto: AwardChallengeDto) {
    return this.challenges.award(id, dto.userIds, dto.notes);
  }

  // ----- Participants -----

  @Get(':id/participants')
  @ApiOperation({ summary: 'Listar participantes del reto' })
  listParticipants(@Param('id') id: string) {
    return this.challenges.listParticipants(id);
  }

  @Post(':id/participants')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Agregar participante al reto (admin)' })
  addParticipant(@Param('id') id: string, @Body() dto: AddParticipantDto) {
    return this.challenges.addParticipant(id, dto.userId);
  }

  @Delete(':id/participants/:userId')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Quitar participante (admin)' })
  async removeParticipant(
    @Param('id') id: string,
    @Param('userId') userId: string,
  ): Promise<void> {
    await this.challenges.removeParticipant(id, userId);
  }

  @Patch(':id/participants/:userId/payment')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Marcar pago de un participante (admin)' })
  markPayment(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: MarkPaymentDto,
  ) {
    return this.challenges.markPayment(id, userId, dto);
  }

  @Patch(':id/participants/me/payment-proof')
  @ApiOperation({ summary: 'Subir comprobante de pago propio' })
  uploadMyPaymentProof(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: PaymentProofDto,
  ) {
    return this.challenges.uploadPaymentProof(id, user.sub, dto);
  }
}
