import {
  BadRequestException,
  Body,
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
import { SheetImportDto } from './dto/sheet-import.dto';
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

  // ---------- Google Sheets (spec google-sheets-import) ----------

  @Get('sheet/status')
  @ApiOperation({
    summary:
      'Estado de la integración con Google Sheets (admin): configured y, con spreadsheetId, si la hoja es legible',
  })
  @ApiQuery({ name: 'spreadsheetId', required: false })
  @ApiQuery({ name: 'range', required: false })
  sheetStatus(
    @Query('spreadsheetId') spreadsheetId?: string,
    @Query('range') range?: string,
  ) {
    return this.importService.getSheetStatus(spreadsheetId || undefined, range || undefined);
  }

  @Post('sheet/preview')
  @ApiOperation({
    summary: 'Previsualizar importación desde una Google Sheet (dry-run, admin). 503 si no está configurada',
  })
  sheetPreview(@Body() dto: SheetImportDto) {
    return this.importService.previewSheet(dto);
  }

  @Post('sheet/commit')
  @ApiOperation({
    summary: 'Importar actividades desde una Google Sheet con las mismas opciones que el archivo (admin)',
  })
  sheetCommit(
    @Body() dto: SheetImportDto,
    @Query() options: ImportOptionsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.importService.commitSheet(dto, options, user.sub);
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
