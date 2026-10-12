import {
  CreateProductSchema,
  UpdateProductSchema,
} from '@ohmypos/api-contracts';
import { createZodDto } from 'nestjs-zod';

export class CreateProductDto extends createZodDto(CreateProductSchema) {}
export class UpdateProductDto extends createZodDto(UpdateProductSchema) {}
