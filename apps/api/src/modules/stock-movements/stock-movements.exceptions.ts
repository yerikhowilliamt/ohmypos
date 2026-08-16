import { ConflictException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';

/**
 * OhMyPos — StockMovements domain exceptions (Playbook §6, plan §10.5).
 *
 * - InsufficientStockException (409) — a state conflict: raised when a sale
 *   would drop `RawMaterial.currentStock` below zero. Playbook §6 names this
 *   exception explicitly. Lists every short material at once (assertSufficientStock
 *   checks all requirements before throwing) — a cashier fixing an order needs
 *   the whole list, not the first failure.
 *
 * `this.name` is set, matching every other `*.exceptions.ts` in the repo.
 */
export class InsufficientStockException extends ConflictException {
  constructor(
    shortfalls: {
      name: string;
      required: Prisma.Decimal;
      available: Prisma.Decimal;
    }[],
  ) {
    super(
      `Insufficient stock: ${shortfalls
        .map(
          (s) =>
            `${s.name} (butuh ${s.required.toFixed(4)}, tersedia ${s.available.toFixed(4)})`,
        )
        .join('; ')}`,
    );
    this.name = 'InsufficientStockException';
  }
}
