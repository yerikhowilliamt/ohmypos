import { createZodDto } from 'nestjs-zod';
import {
  CreatePayableSettlementSchema,
  PayableQuerySchema,
} from '@ohmypos/api-contracts';

/**
 * OhMyPos — Payable DTOs (ADR-010).
 */
export class CreatePayableSettlementDto extends createZodDto(
  CreatePayableSettlementSchema,
) {}

export class PayableQueryDto extends createZodDto(PayableQuerySchema) {}
