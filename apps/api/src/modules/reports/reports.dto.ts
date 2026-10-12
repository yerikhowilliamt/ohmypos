import { createZodDto } from 'nestjs-zod';
import {
  CashBalanceQuerySchema,
  ReportRangeQuerySchema,
  TopProductsQuerySchema,
} from '@ohmypos/api-contracts';

export class ReportRangeQueryDto extends createZodDto(ReportRangeQuerySchema) {}

export class TopProductsQueryDto extends createZodDto(TopProductsQuerySchema) {}

export class CashBalanceQueryDto extends createZodDto(CashBalanceQuerySchema) {}
