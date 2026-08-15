import { Module } from '@nestjs/common';
import { BankParserFactory } from './bank-parser.factory';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';

@Module({
  controllers: [ImportController],
  providers: [ImportService, BankParserFactory],
  exports: [ImportService],
})
export class ImportModule {}
