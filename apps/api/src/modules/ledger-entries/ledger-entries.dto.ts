import {
  CreateLedgerEntrySchema,
  LedgerEntryQuerySchema,
  UpdateLedgerEntrySchema,
} from '@ohmypos/api-contracts';
import { createZodDto } from 'nestjs-zod';

export class CreateLedgerEntryDto extends createZodDto(
  CreateLedgerEntrySchema,
) {}
export class UpdateLedgerEntryDto extends createZodDto(
  UpdateLedgerEntrySchema,
) {}
export class LedgerEntryQueryDto extends createZodDto(LedgerEntryQuerySchema) {}
