import { createZodDto } from 'nestjs-zod';
import {
  CreateSupplierSchema,
  SupplierQuerySchema,
  UpdateSupplierSchema,
} from '@ohmypos/api-contracts';

/**
 * OhMyPos — Supplier DTOs (ADR-010).
 *
 * Wrappers only around shared Zod schemas from `@ohmypos/api-contracts`.
 */
export class CreateSupplierDto extends createZodDto(CreateSupplierSchema) {}
export class UpdateSupplierDto extends createZodDto(UpdateSupplierSchema) {}
export class SupplierQueryDto extends createZodDto(SupplierQuerySchema) {}
