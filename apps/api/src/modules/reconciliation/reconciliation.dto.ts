import { ReconciliationQuerySchema } from '@ohmypos/api-contracts';
import { createZodDto } from 'nestjs-zod';

export class ReconciliationQueryDto extends createZodDto(
  ReconciliationQuerySchema,
) {}
