import { Prisma } from '../../generated/prisma/client';

export interface ResolveUnitPriceInput {
  override?: Prisma.Decimal;
  masterPrice: Prisma.Decimal;
}

export interface ResolvedUnitPrice {
  unitPriceAtSale: Prisma.Decimal;
  isPriceOverridden: boolean;
}

/** An override equal to the master price is not flagged as overridden (ADR-015). */
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

/** Rounded to 2dp, because `lineTotal` is a stored column. */
export function calculateSaleLineTotal(line: SaleLineInput): Prisma.Decimal {
  return line.quantity
    .times(line.unitPrice)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/** Sum of the already-rounded, stored line totals. */
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

/** Exact Σ hppAtSale × quantity, rounded once. Not stored, so never rounded per line. */
export function calculateTotalHpp(lines: TotalHppLineInput[]): Prisma.Decimal {
  const total = lines.reduce(
    (sum, line) => sum.plus(line.hppAtSale.times(line.quantity)),
    new Prisma.Decimal(0),
  );
  return total.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}
