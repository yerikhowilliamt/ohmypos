import { createZodDto } from 'nestjs-zod';
import { PeriodQuerySchema } from '@ohmypos/api-contracts';

/**
 * OhMyPos — Inventory Summary DTOs (ADR-010).
 *
 * Wrappers only around shared Zod schemas from `@ohmypos/api-contracts`.
 */
export class InventorySummaryQueryDto extends createZodDto(PeriodQuerySchema) {}
