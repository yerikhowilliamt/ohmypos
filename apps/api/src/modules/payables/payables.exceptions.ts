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
    super('Payable is already fully settled');
    this.name = 'PayableAlreadySettledException';
  }
}

export class SettlementExceedsPayableException extends BadRequestException {
  constructor(amount: Prisma.Decimal, remainingBalance: Prisma.Decimal) {
    super(
      `Settlement amount ${amount.toFixed(2)} exceeds remaining balance ${remainingBalance.toFixed(2)}`,
    );
    this.name = 'SettlementExceedsPayableException';
  }
}
