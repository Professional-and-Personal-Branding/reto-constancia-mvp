import { PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { ChallengeStatus } from '@prisma/client';
import { CreateChallengeDto } from './create-challenge.dto';

export class UpdateChallengeDto extends PartialType(CreateChallengeDto) {
  @IsOptional()
  @IsEnum(ChallengeStatus)
  status?: ChallengeStatus;
}
