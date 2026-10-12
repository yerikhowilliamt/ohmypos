import { z } from 'zod';
import { AccountType } from './enums';
import {
  MoneyString,
  QuantityString,
  SignedMoneyString,
  UuidString,
} from './primitives';

/** Report dates are inclusive WIB calendar days (ADR-018). */

/** `YYYY-MM-DD`. Rejects `2026-3-5` and `2026-02-30`. */
const ReportDate = z.iso.date();

export const ReportRangeQuerySchema = z
  .object({
    startDate: ReportDate,
    endDate: ReportDate,
    /** Optional filter. Omitted = all branches, including the system location. */
    branchId: UuidString.optional(),
  })
  .refine((q) => q.startDate <= q.endDate, {
    message: 'Tanggal selesai tidak boleh sebelum tanggal mulai',
    path: ['endDate'],
  });
export type ReportRangeQuery = z.infer<typeof ReportRangeQuerySchema>;

/** Echoed on every response so a chart can label itself without re-deriving it. */
export const ReportPeriodSchema = z.object({
  startDate: ReportDate,
  endDate: ReportDate,
  timezone: z.literal('Asia/Jakarta'),
  dayCount: z.number().int(),
  branchId: UuidString.nullable(),
  branchName: z.string().nullable(),
});
export type ReportPeriod = z.infer<typeof ReportPeriodSchema>;

/** P&L (ADR-017): `netProfit` subtracts COGS, never purchases; `cash` subtracts outflows, never COGS. */
export const ProfitLossResponseSchema = z.object({
  period: ReportPeriodSchema,
  salesRevenue: MoneyString,
  otherIncome: MoneyString,
  totalIncome: MoneyString,
  /** Σ (SaleItem.hppAtSale × quantity) — the per-unit snapshot, never live Product HPP. */
  cogs: MoneyString,
  grossProfit: SignedMoneyString,
  /** LedgerEntry OUTFLOW with sourceType = MANUAL only (ADR-017). */
  operatingExpenses: MoneyString,
  netProfit: SignedMoneyString,
  /** null when totalIncome is zero — never NaN. */
  netMarginPct: z.number().nullable(),
  cash: z.object({
    totalInflow: MoneyString,
    totalOutflow: MoneyString,
    /** PURCHASE + PAYABLE_SETTLEMENT — already counted as COGS when sold. */
    materialCashOutflow: MoneyString,
    netCashFlow: SignedMoneyString,
  }),
  saleCount: z.number().int(),
});
export type ProfitLossResponse = z.infer<typeof ProfitLossResponseSchema>;

export const ProductProfitRowSchema = z.object({
  productId: UuidString,
  productName: z.string(),
  quantitySold: QuantityString,
  revenue: MoneyString,
  cogs: MoneyString,
  grossProfit: SignedMoneyString,
  /** null when revenue is zero — a fully discounted line is legal (PRD §5.2). */
  marginPct: z.number().nullable(),
  lineCount: z.number().int(),
});
export type ProductProfitRow = z.infer<typeof ProductProfitRowSchema>;

export const ProductProfitResponseSchema = z.object({
  period: ReportPeriodSchema,
  rows: z.array(ProductProfitRowSchema),
  totals: z.object({
    revenue: MoneyString,
    cogs: MoneyString,
    grossProfit: SignedMoneyString,
  }),
});
export type ProductProfitResponse = z.infer<typeof ProductProfitResponseSchema>;

export const ProductRankBy = z.enum(['quantity', 'revenue', 'profit']);
export type ProductRankBy = z.infer<typeof ProductRankBy>;

export const TopProductsQuerySchema = ReportRangeQuerySchema.safeExtend({
  limit: z.coerce.number().int().min(1).max(50).default(10),
  rankBy: ProductRankBy.default('quantity'),
});
export type TopProductsQuery = z.infer<typeof TopProductsQuerySchema>;

export const TopProductsResponseSchema = z.object({
  period: ReportPeriodSchema,
  rankBy: ProductRankBy,
  rows: z.array(ProductProfitRowSchema.extend({ rank: z.number().int() })),
});
export type TopProductsResponse = z.infer<typeof TopProductsResponseSchema>;

export const IncomeByPaymentMethodRowSchema = z.object({
  accountId: UuidString,
  accountName: z.string(),
  accountType: AccountType,
  total: MoneyString,
  salesTotal: MoneyString,
  otherTotal: MoneyString,
  /** null when the report total is zero. */
  sharePct: z.number().nullable(),
  entryCount: z.number().int(),
});
export type IncomeByPaymentMethodRow = z.infer<
  typeof IncomeByPaymentMethodRowSchema
>;

export const IncomeByPaymentMethodResponseSchema = z.object({
  period: ReportPeriodSchema,
  rows: z.array(IncomeByPaymentMethodRowSchema),
  /** Equals ProfitLossResponse.totalIncome for the same range — a tested invariant. */
  total: MoneyString,
});
export type IncomeByPaymentMethodResponse = z.infer<
  typeof IncomeByPaymentMethodResponseSchema
>;

export const DailyIncomeRowSchema = z.object({
  /** WIB calendar day. Present for EVERY day in range — zero-filled (ADR-018). */
  date: ReportDate,
  income: MoneyString,
  /** Σ (SaleItem.hppAtSale × quantity) for sales sold that WIB day. */
  cogs: MoneyString,
  /** income − COGS − operating expenses that day. Can be negative. */
  netProfit: SignedMoneyString,
  entryCount: z.number().int(),
});
export type DailyIncomeRow = z.infer<typeof DailyIncomeRowSchema>;

export const DailyIncomeResponseSchema = z.object({
  period: ReportPeriodSchema,
  rows: z.array(DailyIncomeRowSchema),
  total: MoneyString,
  /** total ÷ dayCount in range — NOT ÷ the number of days that had income. */
  averagePerDay: MoneyString,
});
export type DailyIncomeResponse = z.infer<typeof DailyIncomeResponseSchema>;

/** Running balance per account before `asOfDate` (WIB). No branch filter by design. */
export const CashBalanceQuerySchema = z.object({
  /** WIB calendar day, inclusive cutoff. Omitted = today in WIB. */
  asOfDate: ReportDate.optional(),
});
export type CashBalanceQuery = z.infer<typeof CashBalanceQuerySchema>;

export const CashBalanceAccountRowSchema = z.object({
  accountId: UuidString,
  accountName: z.string(),
  accountType: AccountType,
  openingBalance: MoneyString,
  /** Cumulative INFLOW − OUTFLOW strictly before asOfDate's exclusive upper bound. */
  netMovement: SignedMoneyString,
  /** openingBalance + netMovement. Can be negative. */
  balance: SignedMoneyString,
});
export type CashBalanceAccountRow = z.infer<typeof CashBalanceAccountRowSchema>;

export const CashBalanceResponseSchema = z.object({
  asOfDate: ReportDate,
  timezone: z.literal('Asia/Jakarta'),
  totalBalance: SignedMoneyString,
  accounts: z.array(CashBalanceAccountRowSchema),
});
export type CashBalanceResponse = z.infer<typeof CashBalanceResponseSchema>;
