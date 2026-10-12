# Inventory

**Owner module for:** `OpeningStock`, the Inventory Summary report (Dashboard 5)
**Related:** PRD §5.5, §5.6 · System Design §6.4, §6.6 · ADR-004, ADR-007, ADR-008, ADR-016, ADR-018, ADR-023, ADR-024 · ERR-005, ERR-045

## Overview

This module covers two features. They live together because the summary reads exactly the movements that the opening writer creates, and both use the same period definition (`period.ts`).

| Feature | Endpoint | Files |
|---|---|---|
| **Opening stock** (monthly stock-take) | `PUT /inventory/opening-stock`, `GET /inventory/opening-stock?period=YYYY-MM` | `opening-stock.*` |
| **Inventory summary** | `GET /inventory/summary?period=YYYY-MM` | `inventory-summary.*`, `stock-status.ts` |

Both endpoints are `OWNER` only. `ADMIN` is excluded on purpose: System Design §5 limits `ADMIN` to master data and reconciliation. Widening that requires a documentation change first (AGENTS.md), not a guard tweak. Neither endpoint has a `BranchScopeGuard` or a `branchId` parameter, because stock is one centralized pool (ADR-004).

Arithmetic lives in pure files (`*.calculator.ts`, `*.rules.ts`, `stock-status.ts`, `period.ts`). Services only query, map and throw, which keeps the invariants below unit-testable without a database.

## Periods (`period.ts`)

A period is one calendar month in Asia/Jakarta: `periodStart` is inclusive and `periodEnd` is **exclusive**. Boundaries are computed by `common/period.ts` (ADR-018). Before ADR-023, inventory used UTC boundaries and disagreed with reports by seven hours at every month boundary. `common/period.ts` is now the only place a month boundary is computed.

`Period.periodMonthDate` is UTC midnight of the 1st and is used **only** for the `OpeningStock.periodMonth` `@db.Date` column. `periodStart` is a WIB instant (`2026-06-30T17:00Z` for July), which a `@db.Date` column would truncate to the previous day. That would break the unique key `(rawMaterialId, periodMonth)` for rows written before ADR-023.

Future periods are rejected (`FuturePeriodNotAllowedException`). A mistyped year would otherwise write a movement dated decades ahead. It would count toward `currentStock` immediately (a running total), yet appear in no report.

## Opening stock

### The delta formula

An `OpeningStock` row is a **declaration** of what was physically counted at the start of the period. The stock movement it produces is the signed difference between that count and what the ledger already says the period opened with:

```
delta = declared − (carryForward + existingOpeningDelta)
```

Two parts of this formula must not be "simplified":

1. **It subtracts `carryForward`, never `currentStock`.** `carryForward` is the signed sum of every movement strictly before `periodStart`. A declaration entered mid-month corrects the *start* of the month and lets that month's sales and purchases carry through. Using `currentStock` gives the right answer only when nothing has moved since `periodStart`, which is exactly the case a casual test covers.
2. **It subtracts `existingOpeningDelta`**, the sum of `OPENING` movements already written for this period, not "the previously declared quantity". The movement ledger is append-only (ERD §3), so a correction is another row, never an edit. This is what makes a second, third and fourth correction all land on the declared number.

Worked example: carry-forward 100, 20 sold during the period (`currentStock` 80), declared 90. The delta is −10 (not +10) and the resulting stock is 70.

### Upsert flow (`OpeningStockService.upsert`)

Everything runs in one transaction, with `timeout: 15000`. The upsert may wait on row locks held by a concurrent sale, and Prisma's 5s default would turn a queued request into a 500.

1. **Existence:** every `rawMaterialId` must exist, otherwise 404, before any lock is taken.
2. **Lock** every material in ascending id order (`lockRawMaterialsInIdOrder`, ADR-016), before reading any balance.
3. **Read** the carry-forward, the existing `OPENING` delta for the period, and which materials had a `PURCHASE` movement in the period. "Purchased this month" is read from the movement ledger, not `SupplierPurchaseItem`, so there is one ledger and one definition, served by the `(rawMaterialId, movementDate)` index.
4. **Validate every entry before writing any:** the unit-price rule, then the non-negative rule. Each rule reports every offender at once, because a stock-take form has dozens of rows and fixing them one 400 at a time is not a workflow.
5. **Write:** upsert the `OpeningStock` rows, then `applyOpening`, with `movementDate = periodStart`, **always**. A date mid-period would make the summary count the correction as `in`/`out`.

`PUT`, not `POST`: the operation is idempotent per `(rawMaterialId, periodMonth)`. Sending the same body twice computes a zero delta, so there is no separate update route to keep in sync.

### Unit-price rule (PRD §5.5)

The unit price is recorded "if no purchase has been made yet that month". It is enforced **in both directions**:

| Material purchased this period? | `unitPrice` supplied | Result |
|---|---|---|
| No | missing | 400 `OpeningStockUnitPriceRequiredException` |
| Yes | present | 400 `OpeningStockUnitPriceNotAllowedException` |

A price supplied when a purchase already priced the material is rejected, not silently ignored. Discarding a number the user typed is how an unintended valuation ends up on a movement. The movement's `unitCostAtMovement` is `unitPrice ?? rawMaterial.unitCost`: the column is NOT NULL, so every movement carries a valuation. A stock-take **never** reprices the material itself (ADR-024).

### Worksheet (`GET /inventory/opening-stock`)

Returns one row per raw material, declared or not, with `requiresUnitPrice` already decided server-side. `purchaseUnit` and `conversionFactor` are for display only (ADR-024). The declared count is always in the material's base `unit`, and the form never accepts a purchase-unit value.

## Inventory summary

### The identity

Every row satisfies:

```
closing = opening + in − out
        ≡ Σ signed(movement) for every movement dated before periodEnd

opening = carryForward + this period's OPENING movements
```

The calculator spec checks this identity with no database, and the e2e suite checks it again against an independent SQL oracle.

### Rules that protect the identity

- **Bucket by direction, not by `referenceType`.** In v1 the two are equivalent (`PURCHASE` is the only other `IN` writer and `SALE` the only `OUT` writer). Once an `ADJUSTMENT` writer appears, though, `referenceType` bucketing would drop it into no bucket, while direction bucketing still lands it in `in` or `out`.
- **Never round.** Every input is `Decimal(18,4)`, and decimal addition at 4dp is exact. A `toDecimalPlaces` call is the one thing that could break the identity by a hair, which is the hardest failure to notice.
- **One read transaction.** All three queries see one instant. Otherwise a sale committing between them would leave the report silently stale.
- **Every material appears,** including ones with no movements at all. A material with zero stock is exactly what the `OUT` badge is for.
- **Computed at query time** with nothing cached or stored (ADR-008), so the report is consistent with the ledger by construction.

### Transaction timeout (ERR-045)

`INVENTORY_SUMMARY_TX_OPTIONS = { maxWait: 5000, timeout: 20000 }`. Measured on 2026-08-30 at 395k sales and 1.8M stock movements: the two `groupBy` queries take about 800 ms when idle, and p95 for the endpoint was 1143 ms. With 25–50 concurrent clients the default 5s timeout expired mid-transaction, producing 40 HTTP 500s in a 60s soak (worst case 6258 ms).

20s is chosen so that hitting the limit means "something is broken", not "today is busy". **If it is ever hit, fix the query or add an index; do not raise the number.** `maxWait: 5000` makes the connection-pool queue fail fast instead of piling up silently.

### Stock status badge (`stock-status.ts`)

| Condition | Status |
|---|---|
| `closing ≤ 0` | `OUT` (checked first, so an empty bin reads `OUT` even when the threshold is its default 0) |
| `closing ≤ lowStockThreshold` | `LOW` (reaching the threshold warns, because that is what a threshold is for) |
| otherwise | `OK` |

A negative closing balance should be unreachable (ADR-007), but if one appears it must not read as `LOW`.

## Errors

| Exception | HTTP | Raised when |
|---|---|---|
| `OpeningStockRawMaterialNotFoundException` | 404 | An `entries[].rawMaterialId` does not exist. It extends `NotFoundException` on purpose: ERR-005 recorded this exception family extending the wrong base class and returning 400 |
| `OpeningStockUnitPriceRequiredException` | 400 | Unit-price rule, missing price |
| `OpeningStockUnitPriceNotAllowedException` | 400 | Unit-price rule, forbidden price |
| `OpeningStockWouldGoNegativeException` | 409 | The resulting stock would be negative (a state conflict, like `InsufficientStockException`) |
| `FuturePeriodNotAllowedException` | 400 | The period has not started |
| `InvalidPeriodException` | 400 | The period is not `YYYY-MM` (Zod normally rejects it first; this covers direct service callers) |

## Testing

| Layer | File | Covers |
|---|---|---|
| Unit | `opening-stock.calculator.spec.ts` | Mid-period declaration, repeated corrections, sort order |
| Unit | `opening-stock.rules.spec.ts` | Unit-price rule in both directions, negative check |
| Unit | `inventory-summary.calculator.spec.ts` | The identity, exhaustively, against Σ signed movements |
| Unit | `inventory-summary.service.spec.ts` | The read transaction carries explicit timeout options (ERR-045) |
| Unit | `period.spec.ts`, `stock-status.spec.ts` | WIB boundaries, badge boundaries |
| E2E | `test/inventory.e2e-spec.ts` | Full flows against Postgres, plus the SQL oracle for the identity |

## History

| When | Change |
|---|---|
| Phase 6 | Opening stock and inventory summary built |
| Phase 8e | Worksheet endpoint for the opening-stock form |
| Phase 14 / ADR-023 | Periods moved from UTC to WIB through `common/period.ts`; `periodMonthDate` kept on UTC so existing rows needed no migration |
| ERR-045 | Explicit read-transaction timeout for the summary |
| ADR-024 | `purchaseUnit` / `conversionFactor` added to the worksheet for display |
