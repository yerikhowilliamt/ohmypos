# Reports

**Owner module for:** Dashboard 3 (financial reports)
**Related:** PRD §5.4 · System Design §5, §6.6, §11 · ADR-005, ADR-008, ADR-011, ADR-014, ADR-015, ADR-017, ADR-018, ADR-025 · DEBT-010

## Overview

This module serves six read-only reports, all computed at query time (ADR-008) and aggregated **in Postgres**. A month of `SUM(hpp_at_sale * quantity)` is about 80k rows that must never cross the wire.

| Endpoint | Method | Source |
|---|---|---|
| `GET /reports/profit-loss` | `profitLoss` | `ledger_entries` (money) and `sale_items` (COGS) |
| `GET /reports/product-profit` | `productProfit` | `sale_items` |
| `GET /reports/top-products?rankBy=&limit=` | `topProducts` | `sale_items` |
| `GET /reports/income-by-payment-method` | `incomeByPaymentMethod` | `ledger_entries` by account |
| `GET /reports/daily-income` | `dailyIncome` | `ledger_entries` and `sale_items`, per WIB day |
| `GET /reports/cash-balance?asOfDate=` | `cashBalance` | `accounts` and `ledger_entries` |

All range reports take `startDate`, `endDate` and an optional `branchId`. An unknown `branchId` is **not** a 404: a filter that matches nothing returns zeros with `branchName: null`.

### Access

**`OWNER` only, on every endpoint.** System Design §6.6 makes the reports screen `OWNER`-only in v1, and `ADMIN` gets only master data and reconciliation (§5). Widening that requires a documentation change first (AGENTS.md), not a decorator edit. `@Roles('OWNER')` is repeated on each handler, so `grep -rn "@Roles" src/modules/reports/` is a complete access inventory.

There is **no `BranchScopeGuard`**. `RoleGuard` already rejects `KASIR`, and `branchId` here is a filter over historical data, not an attribution on a write.

## Invariants

1. **Read-only.** Every method is a `SELECT`. There is no `$transaction` in this module, and there must not be one.
2. **COGS always comes from `sale_items.hpp_at_sale`**, the per-unit snapshot frozen at sale time (ADR-005, ADR-015). This module must never import `calculateHpp`, read `RawMaterial.unitCost`, or touch `RecipeItem`. Doing so makes historical P&L change whenever a material price changes (see the AGENTS.md troubleshooting table).
3. **Tenant isolation is hand-written here.** Raw SQL bypasses the Prisma tenant extension, so every query must go through `tenantScope()` / `ledgerScope()` / `saleScope()`, which emit a **bound** `tenant_id` predicate first. `tenantScope()` **throws** when no tenant is in scope, because a report that silently summed every tenant's money would be the worst possible failure. `test/tenant-isolation.e2e-spec.ts` guards this (ADR-025, DEBT-064).
4. **All values are bound parameters** (`Prisma.sql`). Never build SQL by string concatenation. `rankBy` maps to a pre-built `PRODUCT_ORDER_BY` fragment, even though Zod already restricts it to three literals: an `ORDER BY` built from a request string is where a future edit could turn a validated enum into injected SQL.
5. **Round once, from exact inputs, `HALF_UP`.** Sums are exact in SQL, and `ROUND(…, 2)` is applied once to the total (the same rule as `calculateTotalHpp`). Nothing here is a stored column, so there is nothing to round per row first.
6. **Serialize at the mapper boundary only:** money with `.toFixed(2)`, quantity with `.toFixed(4)` (Playbook §5). `COUNT(*)` is cast `::int` in SQL, because a bare count arrives as `BigInt` and breaks JSON.

## Shared SQL fragments (`report-filters.ts`)

"In this date range" and "in this branch" are defined **once** and reused by every report. Separate hand-written copies of the same predicate drift apart one `>=` at a time.

**Alias contract.** Every query must use these aliases, because the fragments reference them directly:

| Table | Alias |
|---|---|
| `ledger_entries` | `le` |
| `sales` | `s` |
| `sale_items` | `si` |
| `products` | `p` |
| `accounts` | `a` |

Renaming an alias without updating the fragment produces a SQL error, not a wrong number, so the failure is loud.

| Fragment | Emits |
|---|---|
| `tenantScope(alias)` | `<alias>.tenant_id = $1` |
| `ledgerScope(range, branchId?)` | tenant, then `le.entry_date >= from AND le.entry_date < to`, then optional `le.branch_id` |
| `saleScope(range, branchId?)` | tenant, then `s.sold_at` range, then `s.status <> 'VOIDED'`, then optional `s.branch_id` |
| `wibDayOfEntryDate()` / `wibDayOfSoldAt()` | the WIB calendar day as `YYYY-MM-DD` text |

- Ranges are `[from, to)` WIB instants from `common/period.ts` (ADR-018).
- Sale-side reports filter on the **parent sale**, because a `SaleItem` has neither a date nor a branch (ERD §3).
- With no branch filter, the branch predicate is absent entirely, not `AND TRUE`.
- **Both `AT TIME ZONE` conversions are required** in the WIB-day helpers. The columns are `TIMESTAMP(3)` *without* time zone holding a UTC instant: the first conversion reads the value as UTC, and the second converts it to WIB wall-clock time. A single conversion would treat the stored value as already being WIB and shift it seven hours the wrong way. `to_char` is used rather than bare `::date`, because a `date` comes back as a JS `Date` whose rendering depends on the Node process timezone.

## Voided sales (DEBT-010)

A voided sale's row survives for the audit trail, and the void writes a real reversal `OUTFLOW`. The exclusion therefore has two halves:

| Side | Queries | How voids are excluded |
|---|---|---|
| **Sale side** | `productAggregate` (product-profit, top-products), `profitLoss` COGS, `dailyIncome` COGS | `saleScope()` includes `s.status <> 'VOIDED'`, so these need no change of their own |
| **Ledger revenue side** | `profitLoss` `sales_revenue`, `incomeByPaymentMethod` `sales_total`, `dailyIncome` income | Read `ledger_entries` directly, so each one adds `LEFT JOIN sales s ON le.source_type = 'SALE' AND le.source_id = s.id` and filters `s.id IS NULL OR s.status <> 'VOIDED'` |

In P&L, `total_inflow` / `total_outflow` stay **unconditional** on purpose, so the void's reversal `OUTFLOW` still nets the cash view to zero.

## Report definitions

### Profit & loss (ADR-017)

```
totalIncome  = salesRevenue + otherIncome
grossProfit  = totalIncome − cogs
netProfit    = grossProfit − operatingExpenses
netMarginPct = netProfit / totalIncome          (null if totalIncome = 0)

cash.netCashFlow = totalInflow − totalOutflow
```

| Figure | Ledger filter |
|---|---|
| `salesRevenue` | `INFLOW`, `source_type = 'SALE'`, not voided |
| `otherIncome` | `INFLOW`, `source_type <> 'SALE'` |
| `operatingExpenses` | `OUTFLOW`, `source_type = 'MANUAL'` |
| `cash.materialCashOutflow` | `OUTFLOW`, `source_type IN ('PURCHASE', 'PAYABLE_SETTLEMENT')` |

**Material cash outflow is reported but never subtracted from `netProfit`**, because the same cost is already inside `cogs` for whatever has been sold.

### Product profit / top products

These share one aggregate (`productAggregate`) and differ only in `ORDER BY` and `LIMIT`. `SUM(si.hpp_at_sale * si.quantity)` is the expression Prisma's `groupBy` cannot express, and it is why this module uses raw SQL at all. Ties break on `p.name, si.product_id`, so the order is deterministic.

### Income by payment method

This is grouped from `ledger_entries` by account, not from `sales`, so its total equals P&L `totalIncome` by construction (manual income entries carry an account too).

### Daily income

This merges three per-day aggregates: income (ledger `INFLOW`), COGS (`sale_items`), and operating expenses (ledger `OUTFLOW` `MANUAL`). `netProfit` per day uses the same definition as P&L.

- Days are merged over the **union** of all three result sets. A day with a manual expense and no sales must still reduce `netProfit`.
- Missing days are zero-filled in TypeScript (`fillDailyGaps`), not with `generate_series`, so a trend chart gets a continuous series and the logic stays unit-testable. The range is capped at `MAX_REPORT_RANGE_DAYS`, so the array is bounded.
- `averagePerDay` divides by **every day in the range**, not only days with income.

### Cash balance

This is a running balance, not a range report: `opening_balance + Σ movements strictly before the start of asOfDate (WIB)` per account. It uses `LEFT JOIN`, so accounts with no activity still appear. It is written out in full rather than through `ledgerScope`, because it has no lower bound and no branch filter.

### Percentages

`percentageOf` returns a 2dp `HALF_UP` number, or **`null`** when the denominator is zero. It never returns NaN or Infinity: zero revenue is reachable (a fully discounted line is legal, PRD §5.2), and NaN is not valid JSON.

## Testing

| Layer | File | Covers |
|---|---|---|
| Unit | `report-filters.spec.ts` | Parameterisation: input is bound, an absent branch adds no predicate, `tenant_id` is first |
| Unit | `report-math.spec.ts` | Zero denominator, rounding, gap-filling, average per day |
| E2E | `test/reports.e2e-spec.ts` | Every report against Postgres, including WIB boundaries and voids |
| E2E | `test/tenant-isolation.e2e-spec.ts` | Reports never see another tenant's rows |
