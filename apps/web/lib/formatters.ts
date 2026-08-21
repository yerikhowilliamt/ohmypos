/**
 * OhMyPos — Formatting Helpers
 *
 * Centralizes currency, quantity, and percentage formatting across frontend screens (DESIGN.md §8, §9).
 */

const IDR_FORMATTER = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/**
 * Formats a monetary string or number as Indonesian Rupiah (e.g. "Rp 15.000").
 */
export function formatCurrency(
  amount: string | number | null | undefined,
): string {
  if (amount === null || amount === undefined || amount === '') {
    return '—';
  }
  const numeric = typeof amount === 'string' ? Number(amount) : amount;
  if (Number.isNaN(numeric)) {
    return '—';
  }
  return IDR_FORMATTER.format(numeric);
}

/**
 * Formats a decimal quantity string cleanly without trailing unnecessary zeroes (e.g. "1.5000" -> "1,5").
 * Optionally appends a unit label (e.g. "1,5 kg").
 */
export function formatQuantity(
  quantity: string | number | null | undefined,
  unit?: string | null,
): string {
  if (quantity === null || quantity === undefined || quantity === '') {
    return '—';
  }
  const numeric = typeof quantity === 'string' ? Number(quantity) : quantity;
  if (Number.isNaN(numeric)) {
    return '—';
  }

  // Format with Indonesian decimal comma, trimming trailing zeros
  const formatted = new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(numeric);

  return unit ? `${formatted} ${unit}` : formatted;
}

/**
 * Computes and formats the gross profit margin percentage: ((sellPrice - hpp) / sellPrice) * 100.
 * Returns null if HPP is not available or sell price is non-positive.
 */
export function formatMarginPercentage(
  sellPrice: string | number | null | undefined,
  hpp: string | number | null | undefined,
): string | null {
  if (
    sellPrice === null ||
    sellPrice === undefined ||
    hpp === null ||
    hpp === undefined ||
    hpp === ''
  ) {
    return null;
  }

  const sell = typeof sellPrice === 'string' ? Number(sellPrice) : sellPrice;
  const cost = typeof hpp === 'string' ? Number(hpp) : hpp;

  if (Number.isNaN(sell) || Number.isNaN(cost) || sell <= 0) {
    return null;
  }

  const margin = ((sell - cost) / sell) * 100;
  return `${margin.toFixed(1)}%`;
}

/**
 * Formats an already-computed percentage (report marginPct / sharePct /
 * netMarginPct — DailyIncome, ProductProfit, IncomeByPaymentMethod, ProfitLoss
 * response fields) as an Indonesian-locale string. `null` means the API
 * couldn't compute it (zero denominator, PRD §5.2) — never NaN, so `null` is
 * the only falsy case that returns the fallback dash.
 */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  return `${new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)}%`;
}

/**
 * Formats a raw number string into Indonesian thousand-separated display format with dots.
 * e.g. "20000" -> "20.000", "1500000" -> "1.500.000"
 */
export function formatThousands(
  value: string | number | null | undefined,
): string {
  if (value === null || value === undefined || value === '') return '';
  const str = String(value);
  const parts = str.split('.');
  const intPart = parts[0] ?? '';
  const decPart = parts[1];

  const cleanInt = intPart.replace(/[^\d-]/g, '');
  if (!cleanInt) return '';

  const formattedInt = cleanInt.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  if (
    decPart !== undefined &&
    decPart !== '00' &&
    decPart !== '0' &&
    decPart !== ''
  ) {
    return `${formattedInt},${decPart}`;
  }
  return formattedInt;
}

/**
 * Strips formatting (dots for thousands, converts comma to dot for decimal) to return raw decimal string.
 * e.g. "20.000" -> "20000", "1.500.000,50" -> "1500000.50"
 */
export function unformatThousands(value: string | null | undefined): string {
  if (!value) return '';
  const withoutDots = value.replace(/\./g, '');
  const normalized = withoutDots.replace(',', '.');
  return normalized.replace(/[^\d.-]/g, '');
}

const LONG_DATE_FORMATTER = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/**
 * "Kamis, 20 Agustus 2026" — the operating day in WIB, not in the browser's
 * local zone. The business day is Asia/Jakarta everywhere else in the product
 * (report.schema.ts pins every range to it), so a POS header that says
 * "yesterday" to a cashier on a device with a stale timezone would be wrong
 * about which day their sales land on.
 */
export function formatLongDate(date: Date): string {
  return LONG_DATE_FORMATTER.format(date);
}
