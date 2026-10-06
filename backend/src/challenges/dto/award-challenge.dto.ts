import { ArrayMinSize, IsArray, IsOptional, IsString, IsUUID, NotEquals } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { AUTO_DRAW_NOTE } from '../scoring';

export class AwardChallengeDto {
  @ApiProperty({
    description: 'Usuarios ganadores a premiar',
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID(undefined, { each: true })
  userIds!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  // Reservada: solo el sorteo automático del cierre la usa (spec challenge-lifecycle)
  @NotEquals(AUTO_DRAW_NOTE, { message: 'Esa nota está reservada para el sorteo automático' })
  notes?: string;
}
