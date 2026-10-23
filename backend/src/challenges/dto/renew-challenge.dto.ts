import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RenewChallengeDto {
  @ApiPropertyOptional({
    example: 'Reto Noviembre 2026',
    description: 'Nombre del reto nuevo. Sin enviar: "Reto <Mes> <AAAA>".',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({
    default: false,
    description: 'Inscribir a los participantes activos del reto origen, sin pagos ni comprobantes.',
  })
  @IsOptional()
  @IsBoolean()
  copyParticipants?: boolean;
}
