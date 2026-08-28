/**
 * OhMyPos — SupplierPurchase Mapper (ERD §3, plan §9.1, §9.8).
 *
 * Serializes Prisma SupplierPurchase models into SupplierPurchaseResponse contracts
 * with explicit decimal scale formatting via `.toFixed(scale)`.
 */
import type { SupplierPurchaseResponse } from '@ohmypos/api-contracts';
import { Prisma } from '../../generated/prisma/client';

export type SupplierPurchaseWithRelations = Prisma.SupplierPurchaseGetPayload<{
  include: {
    supplier: true;
    items: {
      include: {
        rawMaterial: true;
      };
    };
    payable: true;
  };
}>;

export function toSupplierPurchaseResponse(
  purchase: SupplierPurchaseWithRelations,
): SupplierPurchaseResponse {
  return {
    id: purchase.id,
    supplierId: purchase.supplierId,
    supplierName: purchase.supplier.name,
    branchId: purchase.branchId,
    isCentral: purchase.branchId === null,
    purchaseDate: purchase.purchaseDate.toISOString(),
    paymentStatus: purchase.paymentStatus,
    totalAmount: purchase.totalAmount.toFixed(2),
    ledgerEntryId: purchase.ledgerEntryId ?? null,
    payableId: purchase.payable?.id ?? null,
    note: purchase.note ?? null,
    items: purchase.items.map((item) => ({
      id: item.id,
      rawMaterialId: item.rawMaterialId,
      rawMaterialName: item.rawMaterial.name,
      // The material's CURRENT stock unit. Safe to read live: the stock unit is
      // immutable once movements exist (ADR-024), and a purchase line always
      // implies a movement — so this can never disagree with `quantity`.
      unit: item.rawMaterial.unit,
      // The purchase side comes from the LINE's own snapshot, never from the
      // material — repackaging must not rewrite what an old nota said.
      purchaseQuantity: item.purchaseQuantity.toFixed(4),
      purchaseUnit: item.purchaseUnit,
      conversionFactor: item.conversionFactor.toFixed(4),
      quantity: item.quantity.toFixed(4),
      unitCost: item.unitCost.toFixed(6),
      lineTotal: item.lineTotal.toFixed(2),
    })),
    createdAt: purchase.createdAt.toISOString(),
    updatedAt: purchase.updatedAt.toISOString(),
  };
}
