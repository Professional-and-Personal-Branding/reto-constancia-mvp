import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/** Query del calendario propio: solo `challengeId`; el usuario sale siempre del JWT. */
export class MyCalendarQueryDto {
  @ApiProperty({ description: 'Reto del que se pide el calendario' })
  @IsUUID()
  challengeId!: string;
}
