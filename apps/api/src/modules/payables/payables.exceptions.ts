import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';

/**
 * OhMyPos — Payable domain exceptions (Playbook §6, plan §9.8).
 *
 * - PayableAlreadySettledException (409) — a state conflict: the same request
 *   would be valid against a different state, which is why it is not a 400.
 * - SettlementExceedsPayableException (400) — a bad argument relative to the
 *   current state, matching how `AllocationService` reports exceeding the
 *   allocation cap.
 *
 * `this.name` is set on each, matching `raw-materials.exceptions.ts` and
 * `users.exceptions.ts`.
 */

export class PayableAlreadySettledException extends ConflictException {
  constructor() {
    super('Utang ini sudah lunas, tidak ada sisa yang perlu dibayar.');
    this.name = 'PayableAlreadySettledException';
  }
}

export class SettlementExceedsPayableException extends BadRequestException {
  constructor(amount: Prisma.Decimal, remainingBalance: Prisma.Decimal) {
    super(
      `Jumlah bayar ${amount.toFixed(2)} melebihi sisa utang ${remainingBalance.toFixed(2)}. Isi jumlah yang sama atau lebih kecil dari sisa utang.`,
    );
    this.name = 'SettlementExceedsPayableException';
  }
}
