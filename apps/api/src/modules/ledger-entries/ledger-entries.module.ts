import { Module } from '@nestjs/common';
import { LedgerEntriesController } from './ledger-entries.controller';
import { LedgerEntriesService } from './ledger-entries.service';

@Module({
  controllers: [LedgerEntriesController],
  providers: [LedgerEntriesService],
  exports: [LedgerEntriesService],
})
export class LedgerEntriesModule {}
