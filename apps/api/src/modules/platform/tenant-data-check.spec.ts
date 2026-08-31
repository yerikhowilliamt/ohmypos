import {
  summarizeTenantData,
  type TenantDataCounts,
} from './tenant-data-check';

/**
 * TASK-131. The thing under test is the BASELINE, not the arithmetic: a tenant
 * fresh out of `PlatformTenantsService.create` already holds one OWNER and one
 * system branch, and calling that "data" would make the pristine check useless
 * — it would never be true for any tenant that exists.
 */
describe('summarizeTenantData', () => {
  /** Exactly what provisioning leaves behind. */
  const freshlyProvisioned: TenantDataCounts = {
    users: 1,
    nonSystemBranches: 0,
    accounts: 0,
    suppliers: 0,
    rawMaterials: 0,
    products: 0,
    sales: 0,
    supplierPurchases: 0,
    ledgerEntries: 0,
    bankTransactions: 0,
    devices: 0,
  };

  it('calls a freshly provisioned tenant pristine', () => {
    expect(summarizeTenantData(freshlyProvisioned)).toEqual({
      isPristine: true,
      evidence: [],
    });
  });

  it('does not count the system branch', () => {
    // The system branch is never in `nonSystemBranches`, so a tenant with only
    // that one stays pristine. A real branch does not.
    expect(
      summarizeTenantData({ ...freshlyProvisioned, nonSystemBranches: 1 }),
    ).toEqual({ isPristine: false, evidence: ['1 cabang'] });
  });

  it('counts users above the provisioned OWNER, not the OWNER itself', () => {
    expect(
      summarizeTenantData({ ...freshlyProvisioned, users: 1 }).isPristine,
    ).toBe(true);
    expect(summarizeTenantData({ ...freshlyProvisioned, users: 3 })).toEqual({
      isPristine: false,
      evidence: ['2 pengguna tambahan'],
    });
  });

  it('reports every kind of data it found, sales first', () => {
    const summary = summarizeTenantData({
      ...freshlyProvisioned,
      sales: 12,
      products: 4,
      suppliers: 2,
    });
    expect(summary.isPristine).toBe(false);
    expect(summary.evidence).toEqual([
      '12 penjualan',
      '4 produk',
      '2 supplier',
    ]);
  });

  it('is not fooled by a single row of the quietest kind', () => {
    // One supplier and nothing else is still somebody having started setup —
    // and the whole point of the check is that the operator gets told.
    expect(
      summarizeTenantData({ ...freshlyProvisioned, suppliers: 1 }),
    ).toEqual({ isPristine: false, evidence: ['1 supplier'] });
  });
});
