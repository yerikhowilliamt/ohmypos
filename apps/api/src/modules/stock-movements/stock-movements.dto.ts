import { createZodDto } from 'nestjs-zod';
import { StockMovementQuerySchema } from '@ohmypos/api-contracts';

/**
 * Query DTO for `GET /stock-movements`.
 *
 * There is intentionally no create DTO: movements are written only by
 * `StockMovementsService` inside a caller's transaction.
 */
export class StockMovementQueryDto extends createZodDto(
  StockMovementQuerySchema,
) {}
