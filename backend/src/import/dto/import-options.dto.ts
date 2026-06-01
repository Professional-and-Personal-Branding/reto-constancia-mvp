import { IsEnum, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ActivityStatus } from '@prisma/client';

export type DuplicateStrategy = 'skip' | 'update';

export class ImportOptionsDto {
  @ApiPropertyOptional({
    enum: ActivityStatus,
    default: ActivityStatus.VALIDATED,
    description:
      'Estado por defecto para las actividades importadas (si la fila no trae status).',
  })
  @IsOptional()
  @IsEnum(ActivityStatus)
  defaultStatus?: ActivityStatus;

  @ApiPropertyOptional({
    enum: ['skip', 'update'],
    default: 'skip',
    description: 'Qué hacer si ya existe una actividad para ese día/usuario/reto.',
  })
  @IsOptional()
  @IsIn(['skip', 'update'])
  duplicateStrategy?: DuplicateStrategy;

  @ApiPropertyOptional({
    description:
      'Password temporal para los usuarios creados durante la importación. Si se omite, se genera uno aleatorio.',
    minLength: 8,
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  defaultPassword?: string;
}
