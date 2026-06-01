import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { UploadService } from './upload.service';
import { SignUploadDto } from './dto/sign-upload.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('upload')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('upload')
export class UploadController {
  constructor(private readonly upload: UploadService) {}

  @Post('sign')
  @ApiOperation({
    summary:
      'Genera firma para subir archivo directo a Cloudinary desde el cliente',
  })
  sign(@Body() dto: SignUploadDto) {
    return this.upload.signUpload(dto.folder, dto.resourceType);
  }
}
