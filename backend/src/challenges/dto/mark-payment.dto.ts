import { IsBoolean, IsNumber, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MarkPaymentDto {
  @ApiProperty()
  @IsBoolean()
  paid!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  amountPaid?: number;

  // Sin campos de comprobante: lo sube el participante con su propia carpeta
  // (spec challenge-finance). Enviarlos responde 400.
}
