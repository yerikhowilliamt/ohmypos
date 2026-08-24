/**
 * OhMyPos — cart money math (ADR-015, Phase 8c plan §3).
 *
 * The number on the payment button is what the server will charge, so it must be
 * derived by the same rule the server uses. `calculateSaleLineTotal` /
 * `calculateSaleTotal` round PER LINE and then sum — the opposite of the stock
 * fan-out in `availability.ts`, which rounds once. Both rules are deliberate;
 * swapping them is the drift ADR-015 exists to prevent.
 *
 * There is no tax, no discount, no service charge: `Sale.totalAmount = Σ
 * SaleItem.lineTotal` and nothing else (ADR-015 decision 1, DEBT-004). A
 * "discount" is a per-line price override.
 */
import {
  addFixed,
  formatFixed,
  fromInt,
  mulFixed,
  parseFixed,
  roundHalfUp,
  zero,
  MONEY_SCALE,
} from '@/lib/decimal';
import { effectiveUnitPrice, type CartLine } from './cart.reducer';

/** `lineTotal = roundHalfUp(quantity × unitPrice, 2)` — one line, rounded once. */
export function lineTotal(line: CartLine): string {
  const quantity = fromInt(line.quantity, 0);
  const unitPrice = parseFixed(effectiveUnitPrice(line), MONEY_SCALE);
  return formatFixed(roundHalfUp(mulFixed(quantity, unitPrice), MONEY_SCALE));
}

/** `totalAmount = Σ lineTotal`, each already rounded. */
export function cartTotal(lines: CartLine[]): string {
  const total = lines.reduce(
    (sum, line) => addFixed(sum, parseFixed(lineTotal(line), MONEY_SCALE)),
    zero(MONEY_SCALE),
  );
  return formatFixed(total, MONEY_SCALE);
}

/** Total unit count across the cart, for the "N item" summary. */
export function cartItemCount(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}
