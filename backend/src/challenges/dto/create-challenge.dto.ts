import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TiebreakRule } from '@prisma/client';

export class CreateChallengeDto {
  @ApiProperty({ example: 'Reto Mayo 2026' })
  @IsString()
  name!: string;

  @ApiProperty({ example: 5, minimum: 1, maximum: 12 })
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @ApiProperty({ example: 2026 })
  @IsInt()
  @Min(2024)
  year!: number;

  @ApiProperty({ example: '2026-05-01' })
  @IsISO8601()
  startDate!: string;

  @ApiProperty({ example: '2026-05-31' })
  @IsISO8601()
  endDate!: string;

  @ApiPropertyOptional({
    description: 'Días válidos (0=Dom .. 6=Sáb). Default lunes a sábado.',
    example: [1, 2, 3, 4, 5, 6],
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  validDays?: number[];

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @IsInt()
  @Min(0)
  minHeartRateMinutes?: number; // 0 = sin regla de FC para este reto

  @ApiPropertyOptional({ example: 120 })
  @IsOptional()
  @Type(() => Number)
  feePerParticipant?: number;

  @ApiPropertyOptional({ example: 600 })
  @IsOptional()
  @Type(() => Number)
  budgetTotal?: number;

  @ApiPropertyOptional({ example: 'BOB' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  prizeDescription?: string;

  // ----- Reglas de puntaje (spec challenge-scoring). Defaults = comportamiento histórico -----

  @ApiPropertyOptional({
    example: 1,
    minimum: 0,
    description: 'Puntos por día validado (default 1).',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  pointsPerValidatedDay?: number;

  @ApiPropertyOptional({
    example: 0,
    minimum: 0,
    description: 'Puntos por kilómetro acumulado (default 0 = no suma).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  pointsPerKm?: number;

  @ApiPropertyOptional({
    example: 0,
    minimum: 0,
    description: 'Días validados mínimos para poder ganar (default 0).',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  minValidatedDaysToQualify?: number;

  @ApiPropertyOptional({
    example: 2,
    minimum: 1,
    description: 'Cantidad máxima de ganadores (default 2).',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxWinners?: number;

  @ApiPropertyOptional({
    enum: TiebreakRule,
    default: TiebreakRule.DRAW,
    description:
      'Qué hacer si empatan más personas que cupos: sorteo, más kilómetros, o que ganen todas.',
  })
  @IsOptional()
  @IsEnum(TiebreakRule)
  tiebreakRule?: TiebreakRule;
}
