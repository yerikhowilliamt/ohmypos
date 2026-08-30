import type {
  PrismaService,
  UnscopedPrismaService,
} from '../src/common/prisma/prisma.service';

/**
 * The one FK-safe truncation order for the whole e2e suite.
 *
 * Extracted because DEBT-033: several suites carried near-identical private
 * copies, and when ADR-021 added Device (required FK to Branch) only some of
 * them were updated — so two suites failed permanently in beforeAll on
 * devices_branch_id_fkey, masking any regression they would have caught.
 *
 * A new table with a foreign key goes in this list, once, above its parent.
 *
 * `business_profiles` is deliberately absent: it is a per-tenant singleton that
 * every suite upserts rather than creates, so deleting it would only force each
 * one to recreate it. A suite that provisions its OWN tenants must delete their
 * profiles itself before deleting the tenant rows — see `platform.e2e-spec.ts`.
 *
 * ADR-025: accepts either client. Given the tenant-bound one from
 * `tenantFixture`, the tenant-scoped deletes below are filtered to that tenant
 * — which is a full wipe, because e2e runs with exactly one. `tenants` itself
 * is deliberately NOT deleted: suites hold a tenant id captured in `beforeAll`
 * and several call this again mid-run, so removing the row underneath them
 * would turn every following insert into an FK error.
 */
export async function resetDatabase(
  prisma: PrismaService | UnscopedPrismaService,
): Promise<void> {
  // Platform-side rows are outside the tenant filter, so these delete globally.
  await prisma.impersonationSession.deleteMany({});
  await prisma.platformAdmin.deleteMany({});
  await prisma.allocation.deleteMany({});
  await prisma.bankTransaction.deleteMany({});
  await prisma.payableSettlement.deleteMany({});
  await prisma.payable.deleteMany({});
  await prisma.saleItem.deleteMany({});
  await prisma.sale.deleteMany({});
  await prisma.stockMovement.deleteMany({});
  await prisma.supplierPurchaseItem.deleteMany({});
  await prisma.supplierPurchase.deleteMany({});
  await prisma.ledgerEntry.deleteMany({});
  await prisma.openingStock.deleteMany({});
  await prisma.recipeItem.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.rawMaterial.deleteMany({});
  await prisma.leaveRequest.deleteMany({});
  await prisma.attendanceRecord.deleteMany({});
  await prisma.device.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.account.deleteMany({});
  await prisma.supplier.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.branch.deleteMany({});
}
