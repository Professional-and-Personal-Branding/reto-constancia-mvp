import { Module } from '@nestjs/common';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';
import { SheetsClient } from './sheets.client';

@Module({
  controllers: [ImportController],
  providers: [ImportService, SheetsClient],
})
export class ImportModule {}
