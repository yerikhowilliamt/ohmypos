import { ConflictException, HttpStatus } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';

export interface StockShortfall {
  rawMaterialId: string;
  name: string;
  required: Prisma.Decimal;
  available: Prisma.Decimal;
}

/**
 * 409 raised when a sale would drive any material below zero.
 *
 * Lists every shortfall in `details.shortfalls` so the POS can map each one
 * back to its cart line.
 */
export class InsufficientStockException extends ConflictException {
  constructor(shortfalls: StockShortfall[]) {
    const message = `Insufficient stock: ${shortfalls
      .map(
        (s) =>
          `${s.name} (butuh ${s.required.toFixed(4)}, tersedia ${s.available.toFixed(4)})`,
      )
      .join('; ')}`;

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
