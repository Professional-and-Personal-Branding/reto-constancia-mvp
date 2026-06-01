import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RejectActivityDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  reason!: string;
}
