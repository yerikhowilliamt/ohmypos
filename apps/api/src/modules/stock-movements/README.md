# Stock Movements

**Owner module for:** `StockMovement`, `RawMaterial.currentStock`
**Related:** ADR-004, ADR-007, ADR-010, ADR-011, ADR-016, ADR-024 · System Design §6.1, §6.4, §7 · ERD §3 · Playbook §7

## Overview

This module is the only writer of `RawMaterial.currentStock`. The `StockMovement` log is the source of truth. `currentStock` is a fast-read balance derived from that log, and it is written only here, in the same transaction as the movement that justifies it.

The module has two halves:

| Half | Surface | Who uses it |
|---|---|---|
| **Write** | `StockMovementsService.apply*` and `lockRawMaterialsInIdOrder`. Service-only, with no HTTP route. | Other services, inside their own transaction |
| **Read** | `GET /stock-movements` | Back-office stock history (`OWNER` only) |

## Public API

| Method | Called by | Direction | `referenceType` | `branchId` |
|---|---|---|---|---|
| `lockRawMaterialsInIdOrder(tx, ids)` | `SalesService` (HPP snapshot read), `OpeningStockService` (carry-forward read), every `apply*` | — | — | — |
| `applyInbound(tx, input)` | `SupplierPurchasesService` (purchase), `SalesService` (sale void) | `IN` | `PURCHASE`, `SALE` | Branch, or `null` for a central purchase |
| `applyOutbound(tx, input)` | `SalesService` (sale) | `OUT` | `SALE` | Always a branch, because there is no central sale (ADR-004, ADR-014, ADR-015) |
| `applyOpening(tx, input)` | `OpeningStockService` (monthly stock-take) | `IN` or `OUT`, derived from the signed delta | `OPENING` | Always `null` |
| `findAll(query)` | `StockMovementsController` | — | — | — |

## Invariants

Breaking any of these causes silent data corruption, not a visible error. Read them before changing the service.

1. **Caller owns the transaction.** Every `apply*` method takes the caller's `tx` and never opens its own. The purchase or sale, the stock movement, and the ledger entry must share one transaction boundary (Playbook §7). `findAll` is the only method that uses `this.prisma`, because it is a read and takes part in no one's transaction.

2. **One lock order, taken before any write (ADR-016).** `lockRawMaterialsInIdOrder` runs `SELECT … FOR UPDATE` on each `raw_materials` row in ascending `id` order, de-duplicated. Without a single order, two transactions touching `{A,B}` and `{B,A}` deadlock, and Postgres aborts one with `40P01` (a 500 the caller cannot act on). Because every stock flow (sale, purchase, void, stock-take) uses this one method, they cannot deadlock with each other either.
   - Re-locking a row the transaction already holds is a no-op. Each `apply*` therefore locks again on its own, so it stays correct even when the caller did not lock first.
   - `id` is a `TEXT` column. Do not add a `::uuid` cast: it once made every allocation fail with a 500 (TASK-003).

3. **The lock protects check-then-act, not the arithmetic (ADR-007).** `increment` and `decrement` are atomic `UPDATE … SET x = x ± n`, but the row lock is still required. It serializes the sufficiency check (or the caller's carry-forward read) against the write. If you drop the lock and keep `decrement`, concurrent sales drive the balance negative with no error.

4. **Validate everything before writing anything.** `applyOutbound` runs `assertSufficientStock` over every line before creating any movement. A shortfall therefore never causes a partial decrement, even before the rollback, so two independent mechanisms give the same guarantee. A material missing from the lookup counts as a shortfall rather than being skipped (fail closed).

5. **Stock movements never reprice (ADR-024, DEBT-006).** No `apply*` method writes `RawMaterial.unitCost`:
   - `applyInbound` also reverses voided sales, so repricing there would let a void change live HPP.
   - A sale consumes stock; it does not reprice it.
   - A stock-take corrects the count, not the price. `OpeningStock.unitPrice` values only its own movement.

   Only `SupplierPurchasesService` reprices a material, inside the same transaction.

6. **Decimals cross the wire as strings (ADR-010).** Quantities and costs are serialized with `toString()` / `toFixed(6)`, never as JS numbers, which would silently round a `Decimal(18,4)`.

7. **No write over HTTP.** There is no `CreateStockMovementDto`, and there must not be one. A write DTO would advertise an entry point that does not exist.

## Opening movements (stock-take)

`applyOpening` differs from the other two writers:

- **Signed delta.** The caller passes a correction, not a physical quantity. Direction comes from the sign, and `quantity` stores the absolute value. `increment` with a negative `Decimal` is a correct atomic subtraction, so there is one code path rather than a sign branch.
- **Central only.** `branchId` is always `null`. A stock-take counts the shared pool, not one outlet's shelf, and attributing it to a branch is the ADR-004 mistake the schema exists to prevent (ERD §3).
- **No sufficiency check.** `OpeningStockService` validates `resultingStock` before any write, so the error names the figure the user typed rather than a shortfall they never asked about.
- **A zero delta still writes a movement.** It records that a count happened and confirmed the balance, and it adds nothing to any sum. This keeps "one declaration, one movement" true.
- **`movementDate` is the period start, never `new Date()`.** A stock-take entered on the 5th belongs to the 1st.
- **`referenceId` is per line,** because a bulk stock-take writes one `OpeningStock` row per material. Purchases and sales use one id per event instead.

## Reference types

| `referenceType` | Written by | Meaning |
|---|---|---|
| `PURCHASE` | `applyInbound` | Goods received from a supplier |
| `SALE` | `applyOutbound` / `applyInbound` | A sale consuming stock (`OUT`), or a void reversing it (`IN`) |
| `OPENING` | `applyOpening` | Monthly stock-take correction |

A void reuses `SALE` instead of having its own type (DEBT-010). This is safe because nothing sums `StockMovement` by `referenceType`, unlike `LedgerEntry`, which is summed by `sourceType`.

## Read endpoint — `GET /stock-movements`

**Access:** `OWNER` only, through `RoleGuard`. There is deliberately **no `BranchScopeGuard`**: stock is one centralized pool (ADR-004), so there is no branch-partitioned history to scope. `branchId` is only an *attribution* filter ("which outlet triggered this"), and `OWNER` sees every branch anyway (ADR-011). `InventorySummaryController` follows the same rule.

**Behavior:**

| Concern | Rule | Why |
|---|---|---|
| Date filter | Filters `movementDate`, not `createdAt` | Opening movements are back-dated to the period start, so filtering `createdAt` would hide a stock-take from its own period |
| Search | Case-insensitive on material name or branch name | Central rows (`branchId = null`) never match the branch clause, which is correct |
| Sort | Default `movementDate desc`. `rawMaterialName` uses a nested `orderBy` | Same pattern as `supplierName` in `PayablesService` |
| Branch join | `include: { branch: true }` is a left join | Central rows (every `OPENING`, every central purchase) come back with `branchName: null` rather than being dropped |
| Pagination | `totalPages` is at least 1 | An empty result is still one empty page (the TASK-068 fix) |

## Errors

| Exception | HTTP | Raised when |
|---|---|---|
| `InsufficientStockException` | 409 | `applyOutbound` would drive any material below zero |

The response body lists **every** short material at once, so a cashier fixing an order sees the whole list rather than only the first failure:

```json
{
  "statusCode": 409,
  "error": "Conflict",
  "code": "INSUFFICIENT_STOCK",
  "message": "Insufficient stock: Gula (butuh 2.0000, tersedia 1.0000)",
  "details": {
    "shortfalls": [
      { "rawMaterialId": "…", "name": "Gula", "required": "2.0000", "available": "1.0000" }
    ]
  }
}
```

The POS maps `details.shortfalls[].rawMaterialId` back to cart lines. `message` keeps its original string format, so clients without structured error handling still show something readable.

## Testing

| Layer | File | Covers |
|---|---|---|
| Unit | `stock.rules.spec.ts` | `assertSufficientStock`: every shortfall reported, fail-closed on missing materials, 409 body shape |
| E2E | `test/stock-movements.e2e-spec.ts` | Read endpoint: filters, sort, pagination, access |
| E2E | `test/concurrency.e2e-spec.ts` | Oversubscribed concurrent sales (ADR-007), lock-order deadlock probe (ADR-016), shared pool across branches |
| E2E | `test/sales.e2e-spec.ts`, `test/purchasing-payables.e2e-spec.ts`, `test/inventory.e2e-spec.ts` | Each writer through its calling flow |

## History

| When | Change |
|---|---|
| Phase 4 | Module created as a transaction-participant service with `applyInbound` only and no HTTP surface |
| Phase 5 | `applyOutbound` added. Locking moved into `lockRawMaterialsInIdOrder`, and `applyInbound` switched to it (ADR-016) |
| Phase 6 | `applyOpening` added for monthly stock-takes |
| TASK-070 | Read endpoint `GET /stock-movements` added. Phase 6 had shipped only the aggregate (`GET /inventory/summary`) |
| DEBT-010 | Sale void reverses stock through `applyInbound` with `referenceType: 'SALE'` |
| DEBT-006 / ADR-024 | `unitCost` write-back moved out of this module and into `SupplierPurchasesService` |
