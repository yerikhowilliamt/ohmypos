import { Prisma } from '../../generated/prisma/client';
import { ZeroNormalizedQuantityException } from './supplier-purchases.exceptions';

export interface PurchaseLineInput {
  /** Quantity in the material's PURCHASE unit, as entered. */
  purchaseQuantity: Prisma.Decimal;
  /** The material's conversion factor AT THE TIME OF RECORDING. */
  conversionFactor: Prisma.Decimal;
  /** TOTAL price paid for the whole purchaseQuantity, as entered. */
  lineTotal: Prisma.Decimal;
}

export interface NormalizedPurchaseLine extends PurchaseLineInput {
  /** purchaseQuantity × conversionFactor — the figure stock is incremented by. */
  quantity: Prisma.Decimal;
  /** lineTotal ÷ quantity — cost per STOCK unit. */
  unitCost: Prisma.Decimal;
}

/**
 * Converts a purchase-unit line to stock units: quantity to 4dp, unit cost to
 * 6dp (a rate). `lineTotal` is the user's input and is not rounded (ADR-024).
 *
 * @throws ZeroNormalizedQuantityException
 */
export function normalizePurchaseLine(
  line: PurchaseLineInput,
): NormalizedPurchaseLine {
  const quantity = line.purchaseQuantity
    .times(line.conversionFactor)
    .toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);

  // Unreachable through the API; guards against writing Infinity.
  if (quantity.isZero()) {
    throw new ZeroNormalizedQuantityException();
  }

  const unitCost = line.lineTotal
    .dividedBy(quantity)
    .toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);

  return { ...line, quantity, unitCost };
}

/** Sum of the stored line totals. */
export function calculatePurchaseTotal(
  lineTotals: Prisma.Decimal[],
): Prisma.Decimal {
  return lineTotals
    .reduce((sum, lt) => sum.plus(lt), new Prisma.Decimal(0))
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}
