import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { UploadService } from './upload.service';
import { SignUploadDto } from './dto/sign-upload.dto';
import { UploadPurpose } from './upload-policy';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';
import { ChallengesService } from '../challenges/challenges.service';
import { resolveUploadSignLimit } from '../common/http';

@ApiTags('upload')
@Controller('upload')
export class UploadController {
  constructor(
    private readonly upload: UploadService,
    private readonly challenges: ChallengesService,
  ) {}

  /** Regla de participación según el propósito (spec upload-guardrails). */
  private assertCanUpload(challengeId: string, userId: string, purpose: UploadPurpose) {
    return purpose === 'activity'
      ? this.challenges.assertActiveParticipant(challengeId, userId)
      : this.challenges.assertPaymentParticipant(challengeId, userId);
  }

  @Post('sign')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  // Se lee en cada petición: UPLOAD_SIGN_LIMIT (30 por defecto) también desde backend/.env
  @Throttle({ default: { limit: () => resolveUploadSignLimit(process.env), ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Firma una subida de un participante para un reto y un propósito (Cloudinary o simulador local en dev)',
  })
  @ApiResponse({ status: 403, description: 'No participas en este reto' })
  @ApiResponse({ status: 404, description: 'Reto no encontrado' })
  @ApiResponse({ status: 429, description: 'Demasiadas firmas en un minuto' })
  async sign(@Body() dto: SignUploadDto, @CurrentUser() user: JwtPayload) {
    await this.assertCanUpload(dto.challengeId, user.sub, dto.purpose);
    return this.upload.signUpload(dto.challengeId, user.sub, dto.purpose);
  }

  @Post('local')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Simulador local de Cloudinary (solo dev, requiere sesión): aplica las mismas reglas que la firma y devuelve secure_url/public_id',
  })
  async local(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file?: Express.Multer.File,
    @Body('folder') folder?: string,
  ) {
    if (!this.upload.isLocalMode) {
      throw new BadRequestException(
        'El upload local solo está disponible cuando Cloudinary no está configurado.',
      );
    }
    if (!file) throw new BadRequestException('Archivo requerido (campo "file")');
    const parsed = this.upload.parseLocalFolder(folder, user.sub);
    await this.assertCanUpload(parsed.challengeId, user.sub, parsed.purpose);
    return this.upload.saveLocal(file, folder as string, parsed.purpose);
  }
}
