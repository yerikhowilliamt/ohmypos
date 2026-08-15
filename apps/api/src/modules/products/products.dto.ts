import {
  CreateProductSchema,
  UpdateProductSchema,
} from '@ohmypos/api-contracts';
import { createZodDto } from 'nestjs-zod';

/**
 * Thin wrappers turning shared Zod schemas into NestJS DTO classes (ADR-010, Playbook §11).
 */
export class CreateProductDto extends createZodDto(CreateProductSchema) {}
export class UpdateProductDto extends createZodDto(UpdateProductSchema) {}
