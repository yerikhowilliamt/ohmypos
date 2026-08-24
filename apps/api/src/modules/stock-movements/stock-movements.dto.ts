import { createZodDto } from 'nestjs-zod';
import { StockMovementQuerySchema } from '@ohmypos/api-contracts';

/**
 * OhMyPos — StockMovement DTOs (ADR-010).
 *
 * Read-only, and deliberately so: there is no CreateStockMovementDto and there
 * must not be one. Movements are written exclusively by StockMovementsService
 * inside a caller's transaction (Playbook §7) — a write DTO here would advertise
 * a door that does not exist.
 */
export class StockMovementQueryDto extends createZodDto(
  StockMovementQuerySchema,
) {}
