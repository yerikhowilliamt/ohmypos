import {
  CreateRawMaterialSchema,
  UpdateRawMaterialSchema,
} from '@ohmypos/api-contracts';
import { createZodDto } from 'nestjs-zod';

/**
 * Thin wrappers turning shared Zod schemas into NestJS DTO classes (ADR-010, Playbook §11).
 */
export class CreateRawMaterialDto extends createZodDto(
  CreateRawMaterialSchema,
) {}
export class UpdateRawMaterialDto extends createZodDto(
  UpdateRawMaterialSchema,
) {}
