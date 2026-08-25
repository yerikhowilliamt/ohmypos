import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';

const logger = new Logger('SystemRefs');

/**
 * ADR-014 (plan §3): LedgerEntry.branchId is NOT NULL, but a central purchase
 * has no branch. Central ledger entries are attributed to the seeded central
 * kitchen branch. `SupplierPurchase.branchId = null` remains the ONLY marker
 * for "central" — Pusat is never accepted from a client.
 */
export const CENTRAL_BRANCH_NAME = 'Pusat (Dapur Sentral)';
export const PURCHASE_CATEGORY_NAME = 'Pembelian Bahan Baku';
/** ADR-015, plan §10.3 step 9 — the income LedgerEntry a Sale generates. */
export const SALE_CATEGORY_NAME = 'Penjualan';
export const SYSTEM_CATEGORY_NAMES = [
  PURCHASE_CATEGORY_NAME,
  SALE_CATEGORY_NAME,
] as const;

export function isSystemCategoryName(name: string): boolean {
  return SYSTEM_CATEGORY_NAMES.some((systemName) => systemName === name);
}

export async function resolveLedgerBranchId(
  tx: Prisma.TransactionClient,
  purchaseBranchId: string | null,
): Promise<string> {
  if (purchaseBranchId) return purchaseBranchId;
  const central = await tx.branch.findUnique({
    where: { name: CENTRAL_BRANCH_NAME },
  });
  if (!central) {
    logger.error(
      `System reference missing: branch "${CENTRAL_BRANCH_NAME}". Run the seed for this environment.`,
    );
    throw new ServiceUnavailableException(
      'Konfigurasi sistem belum lengkap. Hubungi administrator.',
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
    logger.error(
      `System reference missing: category "${PURCHASE_CATEGORY_NAME}". Run the seed for this environment.`,
    );
    throw new ServiceUnavailableException(
      'Konfigurasi sistem belum lengkap. Hubungi administrator.',
    );
  }
  return category.id;
}

export async function resolveSaleCategoryId(
  tx: Prisma.TransactionClient,
): Promise<string> {
  const category = await tx.category.findUnique({
    where: { name: SALE_CATEGORY_NAME },
  });
  if (!category) {
    logger.error(
      `System reference missing: category "${SALE_CATEGORY_NAME}". Run the seed for this environment.`,
    );
    throw new ServiceUnavailableException(
      'Konfigurasi sistem belum lengkap. Hubungi administrator.',
    );
  }
  return category.id;
}
