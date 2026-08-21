/**
 * OhMyPos — Payable and Settlement Mapper (ERD §3, plan §9.1, §9.8).
 *
 * Serializes Prisma Payable models into PayableResponse contracts
 * with explicit decimal scale formatting via `.toFixed(scale)`.
 */
import type {
  PayableResponse,
  PayableSettlementResponse,
} from '@ohmypos/api-contracts';
import { Prisma } from '../../generated/prisma/client';

export type PayableWithRelations = Prisma.PayableGetPayload<{
  include: {
    supplier: true;
    settlements: true;
  };
}>;

export function toPayableSettlementResponse(
  s: Prisma.PayableSettlementGetPayload<object>,
): PayableSettlementResponse {
  return {
    id: s.id,
    payableId: s.payableId,
    accountId: s.accountId,
    ledgerEntryId: s.ledgerEntryId,
    amount: s.amount.toFixed(2),
    settledAt: s.settledAt.toISOString(),
    note: s.note ?? null,
    createdAt: s.createdAt.toISOString(),
  };
}

export function toPayableResponse(
  payable: PayableWithRelations,
): PayableResponse {
  const settledAmount = payable.originalAmount.minus(payable.remainingBalance);

  return {
    id: payable.id,
    supplierPurchaseId: payable.supplierPurchaseId,
    supplierId: payable.supplierId,
    supplierName: payable.supplier.name,
    originalAmount: payable.originalAmount.toFixed(2),
    remainingBalance: payable.remainingBalance.toFixed(2),
    settledAmount: settledAmount.toFixed(2),
    status: payable.status,
    settlements: (payable.settlements ?? []).map(toPayableSettlementResponse),
    createdAt: payable.createdAt.toISOString(),
    updatedAt: payable.updatedAt.toISOString(),
  };
}
