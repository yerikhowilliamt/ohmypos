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
      unit: item.rawMaterial.unit,
      quantity: item.quantity.toFixed(4),
      unitCost: item.unitCost.toFixed(2),
      lineTotal: item.lineTotal.toFixed(2),
    })),
    createdAt: purchase.createdAt.toISOString(),
    updatedAt: purchase.updatedAt.toISOString(),
  };
}
