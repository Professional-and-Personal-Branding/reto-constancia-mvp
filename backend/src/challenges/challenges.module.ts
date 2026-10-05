import { Module } from '@nestjs/common';
import { ChallengesController } from './challenges.controller';
import { ChallengesService } from './challenges.service';
import { ResultsService } from './results.service';
import { FinanceService } from './finance.service';
import { UploadCoreModule } from '../upload/upload-core.module';

@Module({
  imports: [UploadCoreModule],
  controllers: [ChallengesController],
  providers: [ChallengesService, ResultsService, FinanceService],
  exports: [ChallengesService, ResultsService, FinanceService],
})
export class ChallengesModule {}
