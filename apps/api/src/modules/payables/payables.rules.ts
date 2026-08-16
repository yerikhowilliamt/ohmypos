import { PayableStatus } from '@ohmypos/api-contracts';
import { Prisma } from '../../generated/prisma/client';
import {
  PayableAlreadySettledException,
  SettlementExceedsPayableException,
} from './payables.exceptions';

/**
 * Pure — no database, no Nest DI (plan §9.6).
 * Playbook §10 puts the Payable/PayableSettlement flow in the "must have thorough tests"
 * tier; keeping the rule pure is what makes exhaustive tests fast and isolated.
 */
export function assertSettlable(
  status: PayableStatus,
  remainingBalance: Prisma.Decimal,
  amount: Prisma.Decimal,
): void {
  // Checked before the amount comparison: "already settled" is a more precise
  // diagnosis than "amount exceeds 0" and deserves its own 409.
  if (status === 'SETTLED' || remainingBalance.lessThanOrEqualTo(0)) {
    throw new PayableAlreadySettledException();
  }
  if (amount.greaterThan(remainingBalance)) {
    throw new SettlementExceedsPayableException(amount, remainingBalance);
  }
}
