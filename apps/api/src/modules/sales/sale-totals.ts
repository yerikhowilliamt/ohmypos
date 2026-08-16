/**
 * OhMyPos — sale totals calculator (ERD §3, ADR-005, ADR-015, plan §10.2).
 *
 * Pure — no Prisma calls, no Nest DI (same shape as products/hpp.calculator.ts
 * and supplier-purchases/purchase-totals.ts).
 *
 * Rounding rule: `lineTotal` is a STORED Decimal(18,2) column, so each line is
 * rounded to 2dp before it is persisted and `totalAmount` is the sum of the
 * values actually stored (same rule as purchase-totals.ts). `totalHpp` is NOT
 * stored anywhere — it is a mapper-computed response field — so it rounds once
 * at the end, the same distinction calculateHpp makes for the same reason. Do
 * not harmonise these two rules; they answer different questions.
 */
import { Prisma } from '../../generated/prisma/client';

export interface ResolveUnitPriceInput {
  override?: Prisma.Decimal;
  masterPrice: Prisma.Decimal;
}

export interface ResolvedUnitPrice {
  unitPriceAtSale: Prisma.Decimal;
  isPriceOverridden: boolean;
}

/**
 * `isPriceOverridden` is true ONLY when an override was supplied AND it
 * differs from the master price (ADR-015). Sending the master price
 * explicitly is not an override — flagging it would put noise in every
 * "which sales were discounted" query.
 */
export function resolveUnitPrice(
  input: ResolveUnitPriceInput,
): ResolvedUnitPrice {
  if (input.override === undefined) {
    return { unitPriceAtSale: input.masterPrice, isPriceOverridden: false };
  }
  return {
    unitPriceAtSale: input.override,
    isPriceOverridden: !input.override.equals(input.masterPrice),
  };
}

export interface SaleLineInput {
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
}

export function calculateSaleLineTotal(line: SaleLineInput): Prisma.Decimal {
  return line.quantity
    .times(line.unitPrice)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/** Sum of the ALREADY-ROUNDED line totals — see the rounding note above. */
export function calculateSaleTotal(
  lineTotals: Prisma.Decimal[],
): Prisma.Decimal {
  return lineTotals
    .reduce((sum, lt) => sum.plus(lt), new Prisma.Decimal(0))
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export interface TotalHppLineInput {
  hppAtSale: Prisma.Decimal;
  quantity: Prisma.Decimal;
}

/**
 * Sums the EXACT products hppAtSale × quantity across every line, then rounds
 * the total ONCE — never the sum of per-line rounded values. Nothing
 * intermediate here is stored (unlike lineTotal above), so this mirrors
 * calculateHpp's round-once rule rather than purchase-totals.ts's round-per-line
 * rule (ADR-005 vs. ERD §3).
 */
export function calculateTotalHpp(lines: TotalHppLineInput[]): Prisma.Decimal {
  const total = lines.reduce(
    (sum, line) => sum.plus(line.hppAtSale.times(line.quantity)),
    new Prisma.Decimal(0),
  );
  return total.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}
