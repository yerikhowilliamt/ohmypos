import { createZodDto } from 'nestjs-zod';
import {
  PeriodQuerySchema,
  UpsertOpeningStockSchema,
} from '@ohmypos/api-contracts';

/**
 * OhMyPos — OpeningStock DTOs (ADR-010).
 *
 * Wrappers only around shared Zod schemas from `@ohmypos/api-contracts`.
 */
export class UpsertOpeningStockDto extends createZodDto(
  UpsertOpeningStockSchema,
) {}

export class OpeningStockPeriodQueryDto extends createZodDto(
  PeriodQuerySchema,
) {}
