import { Module } from '@nestjs/common';

import { ChallengesModule } from '../challenges/challenges.module';
import { UploadController } from './upload.controller';
import { UploadCoreModule } from './upload-core.module';

@Module({
  imports: [UploadCoreModule, ChallengesModule],
  controllers: [UploadController],
  exports: [UploadCoreModule],
})
export class UploadModule {}
