/**
 * OhMyPos — Payables module (ERD §3, ADR-006, System Design §6.3).
 */
import { Module } from '@nestjs/common';
import { LedgerEntriesModule } from '../ledger-entries/ledger-entries.module';
import { PayablesController } from './payables.controller';
import { PayablesService } from './payables.service';

@Module({
  imports: [LedgerEntriesModule],
  controllers: [PayablesController],
  providers: [PayablesService],
  exports: [PayablesService],
})
export class PayablesModule {}
