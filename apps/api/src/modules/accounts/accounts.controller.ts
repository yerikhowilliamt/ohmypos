import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RoleGuard } from '../../common/guards/role.guard';
import { AccountsService } from './accounts.service';
import { CreateAccountDto, UpdateAccountDto } from './accounts.dto';

@ApiTags('accounts')
@Controller('accounts')
@UseGuards(RoleGuard)
@Roles('OWNER', 'ADMIN')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a payment method / cash-holding account' })
  @ApiResponse({ status: 201, description: 'Account created' })
  create(@Body() dto: CreateAccountDto) {
    return this.accountsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all accounts' })
  findAll() {
    return this.accountsService.findAll();
  }

  /**
   * The one account route a KASIR may call: the POS payment-method picker needs
   * it to satisfy `CreateSaleSchema.accountId` (PRD §5.2). Declared BEFORE
   * `@Get(':id')` — Nest matches in declaration order, so the reverse would send
   * `payment-methods` into `ParseUUIDPipe` and 400. The narrowed projection
   * lives in the service; this route never exposes `openingBalance`.
   */
  @Get('payment-methods')
  @Roles('OWNER', 'ADMIN', 'KASIR')
  @ApiOperation({ summary: 'List payment methods for the POS (no balances)' })
  findPaymentMethods() {
    return this.accountsService.findPaymentMethods();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one account' })
  @ApiResponse({ status: 404, description: 'Account not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.accountsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an account' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAccountDto,
  ) {
    return this.accountsService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an account' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.accountsService.remove(id);
  }
}
