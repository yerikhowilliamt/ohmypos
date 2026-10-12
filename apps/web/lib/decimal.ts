/**
 * Fixed-point decimals for the client, backed by scaled BigInt: `{ units: 1250n, scale: 2 }`
 * is 12.50. Money and quantities are never floating point (Playbook §5).
 */

export interface Fixed {
  units: bigint;
  scale: number;
}

/** Scale of `MoneyString` — Decimal(18, 2) per ADR-012 / Playbook §5. */
export const MONEY_SCALE = 2;
/** Scale of `QuantityString` — Decimal(18, 4) per ADR-012 / Playbook §5. */
export const QUANTITY_SCALE = 4;

function pow10(n: number): bigint {
  return 10n ** BigInt(n);
}

/** Parses a wire decimal at `scale`; extra digits are truncated, not rounded. */
export function parseFixed(value: string, scale: number): Fixed {
  const trimmed = value.trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    throw new Error(`Not a decimal string: "${value}"`);
  }

  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [intPart = '0', fracPart = ''] = unsigned.split('.');
  const paddedFrac = fracPart.padEnd(scale, '0').slice(0, scale);
  const units = BigInt(intPart + paddedFrac);

  return { units: negative ? -units : units, scale };
}

/** Builds a `Fixed` from a whole number — the common case for cart quantities. */
export function fromInt(value: number, scale: number): Fixed {
  return { units: BigInt(value) * pow10(scale), scale };
}

export function zero(scale: number): Fixed {
  return { units: 0n, scale };
}

/** Rescales without losing value; only ever widens or truncates deliberately. */
function rescale(value: Fixed, scale: number): Fixed {
  if (value.scale === scale) return value;
  if (scale > value.scale) {
    return { units: value.units * pow10(scale - value.scale), scale };
  }
  return { units: value.units / pow10(value.scale - scale), scale };
}

export function addFixed(a: Fixed, b: Fixed): Fixed {
  const scale = Math.max(a.scale, b.scale);
  return { units: rescale(a, scale).units + rescale(b, scale).units, scale };
}

export function subFixed(a: Fixed, b: Fixed): Fixed {
  const scale = Math.max(a.scale, b.scale);
  return { units: rescale(a, scale).units - rescale(b, scale).units, scale };
}

/** Exact product (scales add). Rounding is a separate, explicit `roundHalfUp` step. */
export function mulFixed(a: Fixed, b: Fixed): Fixed {
  return { units: a.units * b.units, scale: a.scale + b.scale };
}

/** Rounds HALF_UP to `scale`, matching `Prisma.Decimal.ROUND_HALF_UP` on the API. */
export function roundHalfUp(value: Fixed, scale: number): Fixed {
  if (value.scale <= scale) return rescale(value, scale);

  const divisor = pow10(value.scale - scale);
  const negative = value.units < 0n;
  const magnitude = negative ? -value.units : value.units;

  const quotient = magnitude / divisor;
  const remainder = magnitude % divisor;
  // Integer HALF_UP test: dropped tail >= 0.5 ulp.
  const rounded = remainder * 2n >= divisor ? quotient + 1n : quotient;

  return { units: negative ? -rounded : rounded, scale };
}

/** Integer floor of `a / b` (makeable quantity); `null` when `b` is zero. */
export function divFloorToInt(a: Fixed, b: Fixed): number | null {
  if (b.units === 0n) return null;

  const scale = Math.max(a.scale, b.scale);
  const numerator = rescale(a, scale).units;
  const denominator = rescale(b, scale).units;

  if (numerator < 0n) return 0;

  return Number(numerator / denominator);
}

/** `a / b` at `scale`, HALF_UP. Preview only (purchase unit cost); `null` when `b` is zero. */
export function divFixed(a: Fixed, b: Fixed, scale: number): Fixed | null {
  if (b.units === 0n) return null;

  // Scale up first (plus one guard digit) so integer division keeps the needed digits.
  const common = Math.max(a.scale, b.scale);
  const numerator = rescale(a, common).units * pow10(scale + 1);
  const denominator = rescale(b, common).units;

  const negative = numerator < 0n !== denominator < 0n;
  const magnitude =
    (numerator < 0n ? -numerator : numerator) /
    (denominator < 0n ? -denominator : denominator);

  // Rounding off the guard digit makes this HALF_UP.
  return roundHalfUp(
    { units: negative ? -magnitude : magnitude, scale: scale + 1 },
    scale,
  );
}

export function isNegative(value: Fixed): boolean {
  return value.units < 0n;
}

export function compareFixed(a: Fixed, b: Fixed): number {
  const scale = Math.max(a.scale, b.scale);
  const left = rescale(a, scale).units;
  const right = rescale(b, scale).units;
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Renders back to the wire format — a fixed-scale decimal string. */
export function formatFixed(value: Fixed, scale = value.scale): string {
  const target = roundHalfUp(value, scale);
  const negative = target.units < 0n;
  const magnitude = negative ? -target.units : target.units;

  const digits = magnitude.toString().padStart(scale + 1, '0');
  const intPart = digits.slice(0, digits.length - scale);
  const fracPart = scale > 0 ? digits.slice(digits.length - scale) : '';
  const body = scale > 0 ? `${intPart}.${fracPart}` : intPart;

  return negative ? `-${body}` : body;
}

/** Convenience for display helpers that still take a `number`. */
export function toNumber(value: Fixed): number {
  return Number(formatFixed(value));
}
