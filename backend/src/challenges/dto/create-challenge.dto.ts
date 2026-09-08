import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
}
