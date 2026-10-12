import { createZodDto } from 'nestjs-zod';
import {
  CreatePayableSettlementSchema,
  PayableQuerySchema,
} from '@ohmypos/api-contracts';

export class CreatePayableSettlementDto extends createZodDto(
  CreatePayableSettlementSchema,
) {}

export class PayableQueryDto extends createZodDto(PayableQuerySchema) {}
