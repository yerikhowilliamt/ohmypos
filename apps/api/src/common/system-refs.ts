import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';

const logger = new Logger('SystemRefs');

/**
 * ADR-014 (plan §3): LedgerEntry.branchId is NOT NULL, but a central purchase
 * has no branch. Central ledger entries are attributed to a system branch row.
 * `SupplierPurchase.branchId = null` remains the ONLY marker for "central" —
 * the system row is never accepted from a client.
 *
 * That row is a SCOPE ("not tied to any one store"), not a place. Its former
 * name, `Pusat (Dapur Sentral)`, read as a flagship store — which is exactly
 * what it is not, and the business it was named for has no central kitchen.
 *
 * Kept to one word: "Semua Cabang" is already this product's sentinel for
 * "no branch filter", and a longer label collided with it in the report
 * filter — the two sat in one dropdown meaning nearly opposite things.
 *
 * NOTE: this is the DEFAULT LABEL for a fresh install, not a lookup key. The
 * row is found by `Branch.isSystem`, so renaming it breaks nothing. It used to
 * be the key, and a rename broke no FK — so it returned 200 and only the next
 * central purchase failed, with nothing connecting cause to effect.
 */
export const CENTRAL_BRANCH_NAME = 'Umum';
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

/**
 * Creates the rows that `resolveLedgerBranchId`, `resolvePurchaseCategoryId`
 * and `resolveSaleCategoryId` look up. Without them a fresh install fails its
 * FIRST sale and its FIRST central purchase with a 503 reading
 * "Konfigurasi sistem belum lengkap" — `scripts/create-owner.ts` used to create
 * the OWNER row and nothing else, so only databases built from the demo seed
 * ever worked.
 *
 * Idempotent. Called by `scripts/create-owner.ts` (the production path) and by
 * `prisma/seed.ts` (the demo path), so the two cannot drift apart.
 */
export async function ensureSystemRefs(
  tx: Prisma.TransactionClient,
): Promise<void> {
  // Checked by flag, never upserted by name: if the Owner has relabelled the
  // row, an upsert-by-name would create a SECOND system row, which the partial
  // unique index then rejects outright.
  const existing = await tx.branch.findFirst({ where: { isSystem: true } });
  if (!existing) {
    await tx.branch.create({
      data: { name: CENTRAL_BRANCH_NAME, isSystem: true, isMainStore: false },
    });
  }
  await tx.category.upsert({
    where: { name: PURCHASE_CATEGORY_NAME },
    update: {},
    create: { name: PURCHASE_CATEGORY_NAME, type: 'OUTFLOW' },
  });
  await tx.category.upsert({
    where: { name: SALE_CATEGORY_NAME },
    update: {},
    create: { name: SALE_CATEGORY_NAME, type: 'INFLOW' },
  });
}

export async function resolveLedgerBranchId(
  tx: Prisma.TransactionClient,
  purchaseBranchId: string | null,
): Promise<string> {
  if (purchaseBranchId) return purchaseBranchId;
  // Found by flag, never by name — a rename must not be able to break this.
  // At most one row can satisfy it (partial unique index `branches_single_system`).
  const central = await tx.branch.findFirst({ where: { isSystem: true } });
  if (!central) {
    logger.error(
      'System reference missing: no branch with isSystem = true. Run the seed for this environment.',
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
