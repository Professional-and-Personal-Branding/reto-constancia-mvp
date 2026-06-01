import { Module } from '@nestjs/common';
import { ChallengesController } from './challenges.controller';
import { ChallengesService } from './challenges.service';
import { ResultsService } from './results.service';

@Module({
  controllers: [ChallengesController],
  providers: [ChallengesService, ResultsService],
  exports: [ChallengesService, ResultsService],
})
export class ChallengesModule {}
