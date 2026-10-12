import { PayableStatus } from '@ohmypos/api-contracts';
import { Prisma } from '../../generated/prisma/client';
import {
  PayableAlreadySettledException,
  SettlementExceedsPayableException,
} from './payables.exceptions';

/**
 * Validates a settlement against the payable's current state.
 *
 * @throws PayableAlreadySettledException
 * @throws SettlementExceedsPayableException
 */
export function assertSettlable(
  status: PayableStatus,
  remainingBalance: Prisma.Decimal,
  amount: Prisma.Decimal,
): void {
  // Checked first: "already settled" is the more precise 409.
  if (status === 'SETTLED' || remainingBalance.lessThanOrEqualTo(0)) {
    throw new PayableAlreadySettledException();
  }
  if (amount.greaterThan(remainingBalance)) {
    throw new SettlementExceedsPayableException(amount, remainingBalance);
  }
}
