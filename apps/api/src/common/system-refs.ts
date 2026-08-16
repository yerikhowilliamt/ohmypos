import { InternalServerErrorException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';

/**
 * ADR-014 (plan §3): LedgerEntry.branchId is NOT NULL, but a central purchase
 * has no branch. Central ledger entries are attributed to the seeded central
 * kitchen branch. `SupplierPurchase.branchId = null` remains the ONLY marker
 * for "central" — Pusat is never accepted from a client.
 */
export const CENTRAL_BRANCH_NAME = 'Pusat (Dapur Sentral)';
export const PURCHASE_CATEGORY_NAME = 'Pembelian Bahan Baku';

export async function resolveLedgerBranchId(
  tx: Prisma.TransactionClient,
  purchaseBranchId: string | null,
): Promise<string> {
  if (purchaseBranchId) return purchaseBranchId;
  const central = await tx.branch.findUnique({
    where: { name: CENTRAL_BRANCH_NAME },
  });
  if (!central) {
    // An environment fault, not a client error: the seed owns this row.
    throw new InternalServerErrorException(
      `System branch "${CENTRAL_BRANCH_NAME}" is missing — run \`pnpm --filter api db:seed\``,
    );
  }
  return central.id;
}

export async function resolvePurchaseCategoryId(
  tx: Prisma.TransactionClient,
): Promise<string> {
  const category = await tx.category.findUnique({
    where: { name: PURCHASE_CATEGORY_NAME },
  });
  if (!category) {
    // An environment fault, not a client error: the seed owns this row.
    throw new InternalServerErrorException(
      `System category "${PURCHASE_CATEGORY_NAME}" is missing — run \`pnpm --filter api db:seed\``,
    );
  }
  return category.id;
}
