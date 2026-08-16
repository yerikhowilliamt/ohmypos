import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RoleGuard } from '../../common/guards/role.guard';
import { ReconciliationService } from './reconciliation.service';
import { ReconciliationQueryDto } from './reconciliation.dto';

@ApiTags('reconciliation')
@Controller('reconciliation')
@UseGuards(RoleGuard)
@Roles('ADMIN', 'OWNER')
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
