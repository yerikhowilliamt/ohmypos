# Ledger Entries

**Owner module for:** `LedgerEntry` (the cash ledger)
**Related:** ERD §3, §7 · ADR-006, ADR-011, ADR-012, ADR-014 · Playbook §3, §7 · DEF-QA-01

## Overview

This module was ported from Kasync with the ERD v3 extensions (`accountId` required, `sourceType`, `sourceId`) and without the multi-tenant `userId` scoping (ERD §7). `TransactionType` stays `INFLOW`/`OUTFLOW` (ADR-012).

| `sourceType` | Written by |
|---|---|
| `MANUAL` | This module's HTTP API (manual income or expense) |
| `SALE` | `SalesService.create` |
| `SALE_VOID` | `SalesService.void` (reversal `OUTFLOW`, for audit legibility only) |
| `PURCHASE` | `SupplierPurchasesService.create` when `PAID` |
| `PAYABLE_SETTLEMENT` | `PayablesService.settle` |

## Writing entries from other modules

**`createSystemEntry(tx, …)` is the only way another module may write `ledger_entries`** (Playbook §3). It takes the **caller's transaction**, never `this.prisma`, so a sale, purchase or settlement commits or rolls back together with its ledger entry (Playbook §7). Its `sourceType` type excludes `MANUAL`.

## HTTP API (manual entries)

| Endpoint | Access |
|---|---|
| `POST /ledger-entries` | `BranchScopeGuard` (`body.branchId`) |
| `GET /ledger-entries` | `BranchScopeGuard` (`query.branchId`) |
| `GET /ledger-entries/:id` | Any role. A `KASIR` may read only entries of their own branch; the **service** checks this once the entry's `branchId` is known (DEF-QA-01) |
| `PATCH /ledger-entries/:id`, `DELETE /ledger-entries/:id` | `OWNER`, `ADMIN` only: a manual entry is a back-office correction, never a cashier action |

An `:id` route has no body or query field the guard could read a branch from, which is why `GET :id` checks in the service and writes are role-restricted.

- A `null` branch resolves to the **system branch** (`resolveLedgerBranchId`, ADR-014), because `LedgerEntry.branchId` is NOT NULL.
- **`update` refuses any entry that is not `MANUAL`** (409). System entries belong to the flow that created them.
- **`remove` refuses an entry that has allocations** (409: undo the reconciliation match first). System entries are additionally protected by `Restrict` foreign keys from `Sale`, `SupplierPurchase` and `PayableSettlement`.
- Unknown `accountId` / `categoryId` return a 404 up front rather than a foreign-key error.
