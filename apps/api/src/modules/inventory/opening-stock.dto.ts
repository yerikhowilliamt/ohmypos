import { createZodDto } from 'nestjs-zod';
import {
  PeriodQuerySchema,
  UpsertOpeningStockSchema,
} from '@ohmypos/api-contracts';

export class UpsertOpeningStockDto extends createZodDto(
  UpsertOpeningStockSchema,
) {}

export class OpeningStockPeriodQueryDto extends createZodDto(
  PeriodQuerySchema,
) {}
