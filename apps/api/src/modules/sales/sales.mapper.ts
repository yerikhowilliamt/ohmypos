import type { SaleItemResponse, SaleResponse } from '@ohmypos/api-contracts';
import { Prisma } from '../../generated/prisma/client';
import { calculateTotalHpp } from './sale-totals';

export type SaleWithRelations = Prisma.SaleGetPayload<{
  include: {
    branch: true;
    account: true;
    user: true;
    items: {
      include: {
        product: true;
      };
    };
  };
}>;

/** `totalHpp` and `grossMargin` come from stored `hppAtSale` snapshots, never live recipes. */
export function toSaleResponse(sale: SaleWithRelations): SaleResponse {
  const items: SaleItemResponse[] = sale.items.map((item) => ({
    id: item.id,
    productId: item.productId,
    productName: item.product.name,
    quantity: item.quantity.toFixed(4),
    unitPriceAtSale: item.unitPriceAtSale.toFixed(2),
    isPriceOverridden: item.isPriceOverridden,
    hppAtSale: item.hppAtSale.toFixed(2),
    lineTotal: item.lineTotal.toFixed(2),
  }));

  const totalHpp = calculateTotalHpp(
    sale.items.map((item) => ({
      hppAtSale: item.hppAtSale,
      quantity: item.quantity,
    })),
  );
  const grossMargin = sale.totalAmount.minus(totalHpp);

  return {
    id: sale.id,
    branchId: sale.branchId,
    branchName: sale.branch.name,
    accountId: sale.accountId,
    accountName: sale.account.name,
    userId: sale.userId,
    cashierName: sale.user.name,
    ledgerEntryId: sale.ledgerEntryId,
    totalAmount: sale.totalAmount.toFixed(2),
    totalHpp: totalHpp.toFixed(2),
    grossMargin: grossMargin.toFixed(2),
    soldAt: sale.soldAt.toISOString(),
    items,
    status: sale.status,
    voidedAt: sale.voidedAt ? sale.voidedAt.toISOString() : null,
    voidedByUserId: sale.voidedByUserId,
    createdAt: sale.createdAt.toISOString(),
    updatedAt: sale.updatedAt.toISOString(),
  };
}
