import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { UserRole } from '@prisma/client';

import { ImportService } from './import.service';
import { ImportOptionsDto } from './dto/import-options.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';

@ApiTags('import')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('import')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Get('template')
  @ApiOperation({ summary: 'Descargar plantilla de importación (admin)' })
  @ApiQuery({ name: 'format', enum: ['csv', 'xlsx'], required: false })
  template(@Query('format') format: string | undefined, @Res() res: Response) {
    const fmt = format === 'csv' ? 'csv' : 'xlsx';
    const { buffer, filename, contentType } =
      this.importService.buildTemplate(fmt);
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.send(buffer);
  }

  @Post('activities/preview')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Previsualizar importación de actividades (dry-run, admin)',
  })
  preview(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Archivo requerido (campo "file")');
    return this.importService.preview(file.buffer);
  }

  @Post('activities/commit')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Aplicar importación masiva de actividades (admin)' })
  commit(
    @Query() options: ImportOptionsDto,
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Archivo requerido (campo "file")');
    return this.importService.commit(file.buffer, options, user.sub);
  }
}
