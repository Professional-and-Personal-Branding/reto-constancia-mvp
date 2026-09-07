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
  ApiTags,
} from '@nestjs/swagger';

import { UploadService } from './upload.service';
import { SignUploadDto } from './dto/sign-upload.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('upload')
@Controller('upload')
export class UploadController {
  constructor(private readonly upload: UploadService) {}

  @Post('sign')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      'Genera firma para subir archivo directo a Cloudinary (o al simulador local en dev)',
  })
  sign(@Body() dto: SignUploadDto) {
    return this.upload.signUpload(dto.folder, dto.resourceType);
  }

  @Post('local')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Simulador local de Cloudinary (solo dev): guarda el archivo y devuelve secure_url/public_id',
  })
  async local(
    @UploadedFile() file?: Express.Multer.File,
    @Body('folder') folder?: string,
  ) {
    if (!this.upload.isLocalMode) {
      throw new BadRequestException(
        'El upload local solo está disponible cuando Cloudinary no está configurado.',
      );
    }
    if (!file) throw new BadRequestException('Archivo requerido (campo "file")');
    return this.upload.saveLocal(file, folder);
  }
}
