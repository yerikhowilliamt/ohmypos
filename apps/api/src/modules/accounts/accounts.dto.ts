import {
  CreateAccountSchema,
  UpdateAccountSchema,
} from '@ohmypos/api-contracts';
import { createZodDto } from 'nestjs-zod';

/**
 * Thin wrappers turning the shared Zod schemas into NestJS DTO classes, so the
 * global ZodValidationPipe validates and Swagger documents them (ADR-010,
 * Playbook §11). The shape itself is never redeclared here — Kasync's
 * class-validator DTOs are deliberately not ported.
 */
export class CreateAccountDto extends createZodDto(CreateAccountSchema) {}
export class UpdateAccountDto extends createZodDto(UpdateAccountSchema) {}
