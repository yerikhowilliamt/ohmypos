import { createZodDto } from 'nestjs-zod';
import { CreateSaleSchema, SaleQuerySchema } from '@ohmypos/api-contracts';

/**
 * OhMyPos — Sale DTOs (ADR-010).
 *
 * Wrappers only around shared Zod schemas from `@ohmypos/api-contracts`.
 */
export class CreateSaleDto extends createZodDto(CreateSaleSchema) {}

export class SaleQueryDto extends createZodDto(SaleQuerySchema) {}
