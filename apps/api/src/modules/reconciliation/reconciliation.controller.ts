import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReconciliationService } from './reconciliation.service';
import { ReconciliationQueryDto } from './reconciliation.dto';

@ApiTags('reconciliation')
@Controller('reconciliation')
export class ReconciliationController {
  constructor(private readonly reconciliationService: ReconciliationService) {}

  @Get('transactions')
  @ApiOperation({
    summary: 'List bank transactions for the reconciliation screen',
  })
  getTransactions(@Query() query: ReconciliationQueryDto) {
    return this.reconciliationService.getTransactions(query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Status counts and bank-vs-ledger variance' })
  getSummary(@Query() query: ReconciliationQueryDto) {
    return this.reconciliationService.getDashboardSummary(query);
  }
}
