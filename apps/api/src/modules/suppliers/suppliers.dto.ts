import { createZodDto } from 'nestjs-zod';
import {
  CreateSupplierSchema,
  SupplierQuerySchema,
  UpdateSupplierSchema,
} from '@ohmypos/api-contracts';

export class CreateSupplierDto extends createZodDto(CreateSupplierSchema) {}
export class UpdateSupplierDto extends createZodDto(UpdateSupplierSchema) {}
export class SupplierQueryDto extends createZodDto(SupplierQuerySchema) {}
