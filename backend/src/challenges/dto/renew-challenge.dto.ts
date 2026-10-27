import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class RenewChallengeDto {
  @ApiPropertyOptional({
    example: 'Reto Noviembre 2026',
    description: 'Nombre del reto nuevo. Sin enviar: "Reto <Mes> <AAAA>".',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(100, { message: 'El nombre no puede superar los 100 caracteres' })
  name?: string;

  @ApiPropertyOptional({
    default: false,
    description: 'Inscribir a los participantes activos del reto origen, sin pagos ni comprobantes.',
  })
  @IsOptional()
  // Valor original: la conversión implícita del ValidationPipe volvería "false" en true.
  @Transform(({ obj }) => obj.copyParticipants)
  @IsBoolean({ message: 'copyParticipants debe ser verdadero o falso' })
  copyParticipants?: boolean;
}
