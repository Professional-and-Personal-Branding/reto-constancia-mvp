import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class BulkAddParticipantsDto {
  @ApiProperty({ type: [String], minItems: 1, maxItems: 200, description: 'Ids de usuario (UUID v4)' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  userIds!: string[];
}
