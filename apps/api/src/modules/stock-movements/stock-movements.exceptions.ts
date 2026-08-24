import { ConflictException, HttpStatus } from '@nestjs/common';
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
export interface StockShortfall {
  rawMaterialId: string;
  name: string;
  required: Prisma.Decimal;
  available: Prisma.Decimal;
}

export class InsufficientStockException extends ConflictException {
  constructor(shortfalls: StockShortfall[]) {
    const message = `Insufficient stock: ${shortfalls
      .map(
        (s) =>
          `${s.name} (butuh ${s.required.toFixed(4)}, tersedia ${s.available.toFixed(4)})`,
      )
      .join('; ')}`;

    /**
     * Constructed with an object descriptor rather than a bare string so the POS
     * can map each shortfall back to the cart lines that caused it. The global
     * filter returns `getResponse()` verbatim for any HttpException, so this
     * object is exactly what the client receives.
     *
     * `message` stays byte-identical to the previous string form — `this.message`
     * is initialised from this key, so existing assertions on the message keep
     * holding, and `error: 'Conflict'` preserves the default envelope shape.
     */
    super({
      statusCode: HttpStatus.CONFLICT,
      error: 'Conflict',
      code: 'INSUFFICIENT_STOCK',
      message,
      details: {
        shortfalls: shortfalls.map((s) => ({
          rawMaterialId: s.rawMaterialId,
          name: s.name,
          required: s.required.toFixed(4),
          available: s.available.toFixed(4),
        })),
      },
    });
    this.name = 'InsufficientStockException';
  }
}
