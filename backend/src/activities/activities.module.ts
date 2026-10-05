import { Module } from '@nestjs/common';
import { ActivitiesController } from './activities.controller';
import { ActivitiesService } from './activities.service';
import { ChallengesModule } from '../challenges/challenges.module';
import { UploadCoreModule } from '../upload/upload-core.module';

@Module({
  imports: [ChallengesModule, UploadCoreModule],
  controllers: [ActivitiesController],
  providers: [ActivitiesService],
})
export class ActivitiesModule {}
