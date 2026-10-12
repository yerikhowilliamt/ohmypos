import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { currentTenantId } from './prisma/tenant-context';

const logger = new Logger('SystemRefs');

/** Default label of the system branch. Not a lookup key: the row is found by `isSystem`. */
export const CENTRAL_BRANCH_NAME = 'Umum';
export const PURCHASE_CATEGORY_NAME = 'Pembelian Bahan Baku';
/** Category of the income ledger entry a sale writes. */
export const SALE_CATEGORY_NAME = 'Penjualan';
export const SYSTEM_CATEGORY_NAMES = [
  PURCHASE_CATEGORY_NAME,
  SALE_CATEGORY_NAME,
] as const;

export function isSystemCategoryName(name: string): boolean {
  return SYSTEM_CATEGORY_NAMES.some((systemName) => systemName === name);
}

/** Category lookups must be keyed by tenant; a global-name lookup would mix tenants. */
function requireTenantId(): string {
  const tenantId = currentTenantId();
  if (!tenantId) {
    logger.error(
      'System refs resolved with no tenant in scope. Wrap the call in runWithTenant().',
    );
    throw new ServiceUnavailableException(
      'Konfigurasi sistem belum lengkap. Hubungi administrator.',
    );
  }
  return tenantId;
}

/**
 * Idempotently creates the system branch and system categories for the
 * current tenant. Every provisioning path must call it.
 */
export async function ensureSystemRefs(
  tx: Prisma.TransactionClient,
): Promise<void> {
  const tenantId = requireTenantId();
  // By flag, never by name: the Owner may have relabelled the row.
  const existing = await tx.branch.findFirst({ where: { isSystem: true } });
  if (!existing) {
    await tx.branch.create({
      data: { name: CENTRAL_BRANCH_NAME, isSystem: true, isMainStore: false },
    });
  }
  await tx.category.upsert({
    where: { tenantId_name: { tenantId, name: PURCHASE_CATEGORY_NAME } },
    update: {},
    create: { tenantId, name: PURCHASE_CATEGORY_NAME, type: 'OUTFLOW' },
  });
  await tx.category.upsert({
    where: { tenantId_name: { tenantId, name: SALE_CATEGORY_NAME } },
    update: {},
    create: { tenantId, name: SALE_CATEGORY_NAME, type: 'INFLOW' },
  });
}

export async function resolveLedgerBranchId(
  tx: Prisma.TransactionClient,
  purchaseBranchId: string | null,
): Promise<string> {
  if (purchaseBranchId) return purchaseBranchId;
  // By flag, never by name. At most one row matches (`branches_single_system`).
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
    where: {
      tenantId_name: {
        tenantId: requireTenantId(),
        name: PURCHASE_CATEGORY_NAME,
      },
    },
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
    where: {
      tenantId_name: { tenantId: requireTenantId(), name: SALE_CATEGORY_NAME },
    },
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
