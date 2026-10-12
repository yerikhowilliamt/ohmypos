import { createZodDto } from 'nestjs-zod';
import {
  CreateSupplierPurchaseSchema,
  SupplierPurchaseQuerySchema,
} from '@ohmypos/api-contracts';

export class CreateSupplierPurchaseDto extends createZodDto(
  CreateSupplierPurchaseSchema,
) {}

export class SupplierPurchaseQueryDto extends createZodDto(
  SupplierPurchaseQuerySchema,
) {}
