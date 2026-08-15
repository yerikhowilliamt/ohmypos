import { ReplaceRecipeSchema } from '@ohmypos/api-contracts';
import { createZodDto } from 'nestjs-zod';

/**
 * Thin wrapper turning shared ReplaceRecipeSchema into NestJS DTO class (ADR-010, Playbook §11).
 */
export class ReplaceRecipeDto extends createZodDto(ReplaceRecipeSchema) {}
