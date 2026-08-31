/**
 * TASK-131 — "has this tenant been used yet?", as a pure decision.
 *
 * Split out of `PlatformTenantsService` because the counting is trivial and the
 * judgement is not: what provisioning itself creates must NOT count as data, so
 * the interesting part is the set of exclusions, and a set of exclusions is
 * worth testing without a database. See `tenant-data-check.spec.ts`.
 *
 * Provisioning (`PlatformTenantsService.create`) leaves exactly: one Tenant,
 * one BusinessProfile, one system Branch, the two system Categories, and one
 * OWNER. Everything below is therefore counted against a baseline of zero,
 * except `users` (baseline 1) and branches (only non-system ones are counted).
 */
export interface TenantDataCounts {
  /** Every user in the tenant, the provisioned OWNER included. */
  users: number;
  /** `isSystem: false` only — the system branch is provisioning's own row. */
  nonSystemBranches: number;
  accounts: number;
  suppliers: number;
  rawMaterials: number;
  products: number;
  sales: number;
  supplierPurchases: number;
  ledgerEntries: number;
  bankTransactions: number;
  devices: number;
}

export interface TenantDataSummary {
  /** Nothing here beyond what provisioning created. */
  isPristine: boolean;
  /**
   * What was found, in Indonesian, ready to be read by an operator — it goes
   * into the 409 message and into the audit line. Empty when pristine.
   */
  evidence: string[];
}

/**
 * Ordered most-alarming-first: an operator who reads only the first item
 * should be reading the one that most argues against the change.
 */
const LABELS: ReadonlyArray<[keyof TenantDataCounts, string, number]> = [
  ['sales', 'penjualan', 0],
  ['ledgerEntries', 'catatan kas', 0],
  ['bankTransactions', 'mutasi bank', 0],
  ['supplierPurchases', 'pembelian', 0],
  ['products', 'produk', 0],
  ['rawMaterials', 'bahan baku', 0],
  ['suppliers', 'supplier', 0],
  ['accounts', 'akun kas/bank', 0],
  ['devices', 'perangkat terdaftar', 0],
  ['nonSystemBranches', 'cabang', 0],
  // Baseline 1: the OWNER provisioning created is not evidence of use.
  ['users', 'pengguna tambahan', 1],
];

export function summarizeTenantData(
  counts: TenantDataCounts,
): TenantDataSummary {
  const evidence: string[] = [];
  for (const [key, label, baseline] of LABELS) {
    const excess = counts[key] - baseline;
    if (excess > 0) {
      evidence.push(`${excess} ${label}`);
    }
  }
  return { isPristine: evidence.length === 0, evidence };
}
