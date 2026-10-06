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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { ChallengeWithParticipants, ChallengesService } from './challenges.service';
import { ChallengeResults, ResultsService } from './results.service';
import {
  ChallengeView,
  projectChallengeForViewer,
  projectResultsForViewer,
  PublicChallengeResults,
} from './privacy';
import { FinanceService } from './finance.service';
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
    private readonly finance: FinanceService,
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

  @Get('active/list')
  @ApiOperation({
    summary:
      'Todos los retos activos (más reciente primero) con isParticipant y me (inscripción propia). Solo el admin recibe la lista de inscritos',
  })
  async findActiveList(
    @CurrentUser() user: JwtPayload,
  ): Promise<ChallengeView<ChallengeWithParticipants & { isParticipant: boolean }>[]> {
    const list = await this.challenges.findActiveList(user.sub);
    return list.map((challenge) => projectChallengeForViewer(challenge, user));
  }

  @Get('active')
  @ApiOperation({
    summary:
      'Reto activo por defecto: el más reciente en el que participa el usuario, si no el activo más reciente. Incluye me; solo el admin recibe la lista de inscritos',
  })
  async findActive(
    @CurrentUser() user: JwtPayload,
  ): Promise<ChallengeView<ChallengeWithParticipants> | null> {
    const challenge = await this.challenges.findActive(user.sub);
    return challenge ? projectChallengeForViewer(challenge, user) : null;
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Detalle de un reto. Incluye me; solo el admin recibe la lista de inscritos',
  })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<ChallengeView<ChallengeWithParticipants>> {
    return projectChallengeForViewer(await this.challenges.findOne(id), user);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Actualizar reto (admin)' })
  update(@Param('id') id: string, @Body() dto: UpdateChallengeDto) {
    return this.challenges.update(id, dto);
  }

  @Post(':id/close')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Cerrar reto (admin). Solo un reto activo; si hace falta sorteo, se hace una vez y se guarda',
  })
  @ApiResponse({ status: 400, description: 'Solo se puede cerrar un reto activo' })
  @ApiResponse({ status: 409, description: 'El reto se está cerrando; vuelve a intentarlo en unos segundos' })
  close(@Param('id') id: string) {
    return this.challenges.close(id);
  }

  @Post(':id/activate')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Activar reto (admin). Solo DRAFT -> ACTIVE; idempotente si ya está activo; pueden coexistir varios activos',
  })
  @ApiResponse({ status: 400, description: 'Un reto cerrado no puede reactivarse' })
  @ApiResponse({ status: 403, description: 'Solo administradores' })
  activate(@Param('id') id: string) {
    return this.challenges.activate(id);
  }

  @Get(':id/close-preview')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Resumen previo al cierre (admin, solo lectura): pendientes, comprobantes por revisar, impagos y proyección de ganadores y reparto',
  })
  @ApiResponse({ status: 400, description: 'Solo se puede cerrar un reto activo / El reto ya está cerrado' })
  @ApiResponse({ status: 403, description: 'Solo administradores' })
  closePreview(@Param('id') id: string) {
    return this.challenges.closePreview(id);
  }

  @Get(':id/finance')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Resumen financiero del reto (admin): esperado, recaudado, pendiente, cobertura del presupuesto y estado de pago por participante',
  })
  getFinance(@Param('id') id: string) {
    return this.finance.getFinance(id);
  }

  @Get(':id/results')
  @ApiOperation({
    summary:
      'Ranking, ganadores y resumen del reto. Solo el admin recibe el email y el estado de pago de cada fila',
  })
  async getResults(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<ChallengeResults | PublicChallengeResults> {
    return projectResultsForViewer(await this.results.getResults(id), user);
  }

  @Post(':id/awards')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Registrar ganadores premiados del reto (admin)' })
  award(@Param('id') id: string, @Body() dto: AwardChallengeDto) {
    return this.challenges.award(id, dto.userIds, dto.notes);
  }

  // ----- Participants -----

  @Get(':id/participants')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Listar participantes del reto (admin)' })
  @ApiResponse({ status: 403, description: 'Solo administradores' })
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
