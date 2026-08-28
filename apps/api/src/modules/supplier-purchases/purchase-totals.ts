/**
 * OhMyPos — Pure purchase conversion + totals calculator (ERD §3, ADR-024).
 *
 * Pure — no Prisma database calls, no Nest DI (same pattern as products/hpp.calculator.ts).
 *
 * ADR-024 changed what a purchase line IS. The user now enters what the nota
 * says — a quantity in the supplier's pack unit and the TOTAL price paid for it
 * — and the two normalized figures the rest of the system runs on are derived
 * here:
 *
 *   normalizedStockQuantity = purchaseQuantity × conversionFactor
 *   normalizedUnitCost      = lineTotal ÷ normalizedStockQuantity
 *
 * Rounding, and why the three values round differently:
 *   - `quantity` rounds to 4dp because Decimal(18,4) is what gets stored and
 *     what `currentStock` is incremented by.
 *   - `unitCost` rounds to 6dp, not 2. It is a RATE: Rp10.000 over 3.000 gram
 *     is 3,333333/gram, and storing 3,33 would understate that product's HPP by
 *     ~0,1% forever.
 *   - `lineTotal` is not rounded at all here — it is the user's input, already
 *     at 2dp, and `totalAmount` is the sum of exactly those stored values.
 *
 * Do not "harmonise" these with calculateHpp's round-once rule: that function
 * stores nothing intermediate, these three columns all persist.
 */
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

export function normalizePurchaseLine(
  line: PurchaseLineInput,
): NormalizedPurchaseLine {
  const quantity = line.purchaseQuantity
    .times(line.conversionFactor)
    .toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);

  // Both inputs are already refused at zero by Zod (purchaseQuantity) and by
  // ConversionFactorString, so this is unreachable through the API. It exists
  // because the alternative to throwing is emitting Infinity into a money
  // column, and a caller that bypasses the contract deserves an error, not that.
  if (quantity.isZero()) {
    throw new ZeroNormalizedQuantityException();
  }

  const unitCost = line.lineTotal
    .dividedBy(quantity)
    .toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);

  return { ...line, quantity, unitCost };
}

/**
 * Sum of the line totals the user entered. Unlike before ADR-024 this multiplies
 * nothing — the totals are inputs, so the purchase total is exactly the sum of
 * the values actually stored on the rows.
 */
export function calculatePurchaseTotal(
  lineTotals: Prisma.Decimal[],
): Prisma.Decimal {
  return lineTotals
    .reduce((sum, lt) => sum.plus(lt), new Prisma.Decimal(0))
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}
