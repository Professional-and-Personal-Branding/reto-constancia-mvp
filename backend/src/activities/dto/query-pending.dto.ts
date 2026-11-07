import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';

export type PendingOrder = 'asc' | 'desc';

/** Query de GET /activities/pending (spec challenge-lifecycle, cola de validación). */
export class QueryPendingDto {
  @ApiPropertyOptional({ description: 'Solo las pendientes de este reto; sin él, las de todos' })
  @IsOptional()
  @IsUUID()
  challengeId?: string;

  @ApiPropertyOptional({
    enum: ['asc', 'desc'],
    default: 'asc',
    description: 'Orden por fecha de la actividad y luego por creación; ascendente por defecto',
  })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: PendingOrder;
}
