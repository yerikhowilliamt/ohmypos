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
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AccountsService } from './accounts.service';
import { CreateAccountDto, UpdateAccountDto } from './accounts.dto';

@ApiTags('accounts')
@Controller('accounts')
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
