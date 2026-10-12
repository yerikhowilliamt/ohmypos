import { createZodDto } from 'nestjs-zod';
import { PeriodQuerySchema } from '@ohmypos/api-contracts';

export class InventorySummaryQueryDto extends createZodDto(PeriodQuerySchema) {}
