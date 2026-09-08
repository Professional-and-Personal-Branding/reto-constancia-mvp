import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class SheetImportDto {
  @ApiProperty({
    description: 'ID de la hoja de cálculo (el segmento entre /d/ y /edit de la URL de Google Sheets)',
  })
  @IsString()
  @Length(10, 200)
  spreadsheetId!: string;

  @ApiPropertyOptional({
    description:
      'Nombre de la hoja o rango A1 (p. ej. "mayo" o "mayo!A:Z"). Si se omite se usa GOOGLE_SHEETS_DEFAULT_RANGE o la primera hoja.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  range?: string;
}
