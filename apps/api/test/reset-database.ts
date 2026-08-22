import { PrismaService } from '../src/common/prisma/prisma.service';

/**
 * The one FK-safe truncation order for the whole e2e suite.
 *
 * Extracted because DEBT-033: several suites carried near-identical private
 * copies, and when ADR-021 added Device (required FK to Branch) only some of
 * them were updated — so two suites failed permanently in beforeAll on
 * devices_branch_id_fkey, masking any regression they would have caught.
 *
 * A new table with a foreign key goes in this list, once, above its parent.
 */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
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
