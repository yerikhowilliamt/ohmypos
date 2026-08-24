import { createZodDto } from 'nestjs-zod';
import {
  CashBalanceQuerySchema,
  ReportRangeQuerySchema,
  TopProductsQuerySchema,
} from '@ohmypos/api-contracts';

/**
 * OhMyPos — Report DTOs (ADR-010).
 *
 * Wrappers only around shared Zod schemas from `@ohmypos/api-contracts`.
 */
export class ReportRangeQueryDto extends createZodDto(ReportRangeQuerySchema) {}

export class TopProductsQueryDto extends createZodDto(TopProductsQuerySchema) {}

export class CashBalanceQueryDto extends createZodDto(CashBalanceQuerySchema) {}
