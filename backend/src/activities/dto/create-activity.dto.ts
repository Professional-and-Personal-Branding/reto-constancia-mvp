import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExerciseType, PhotoType } from '@prisma/client';

export class ActivityPhotoInput {
  @ApiProperty()
  @IsString()
  url!: string;

  @ApiProperty()
  @IsString()
  cloudinaryId!: string;

  @ApiPropertyOptional({ enum: PhotoType })
  @IsOptional()
  @IsEnum(PhotoType)
  type?: PhotoType;
}

export class CreateActivityDto {
  @ApiProperty()
  @IsUUID()
  challengeId!: string;

  @ApiProperty({
    example: '2026-05-06',
    description: 'Día de la actividad (no del upload)',
  })
  @IsISO8601()
  date!: string;

  @ApiProperty({ enum: ExerciseType })
  @IsEnum(ExerciseType)
  exerciseType!: ExerciseType;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  durationMinutes!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  distanceKm?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(30)
  avgHeartRate?: number;

  @ApiPropertyOptional({
    minimum: 1,
    description:
      'Minutos de registro de FC según la captura. Obligatorio cuando el reto tiene minHeartRateMinutes > 0; no puede superar durationMinutes',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  heartRateMinutes?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  hasHeartRateProof?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [ActivityPhotoInput] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Al menos una foto/captura es obligatoria' })
  @ValidateNested({ each: true })
  @Type(() => ActivityPhotoInput)
  photos!: ActivityPhotoInput[];
}
