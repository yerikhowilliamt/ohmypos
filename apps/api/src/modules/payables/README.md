# Payables

**Owner module for:** `Payable` (utang), `PayableSettlement`
**Related:** PRD §5.3 · ERD §3, §6 · System Design §6.3 · ADR-006, ADR-014, ADR-016 · DEBT-007

## Overview

A `Payable` is created by `SupplierPurchasesService` when a purchase is recorded `UNPAID` (ADR-006). This module lists payables and settles them, fully or partially.

| Endpoint | Roles |
|---|---|
| `GET /payables`, `GET /payables/:id`, `GET /payables/summary` | `OWNER`, `ADMIN` |
| `POST /payables/:id/settlements` | **`OWNER` only**: money leaving the central account |

`GET /payables/summary` returns the open balance per supplier (`OPEN` and `PARTIALLY_SETTLED` payables). `GET /payables` can sort by `supplierName`, which uses a nested `orderBy` because it lives on `Supplier`.

## Settlement (`PayablesService.settle`)

`remainingBalance` and `status` are **stored** columns, written **only** inside the settlement transaction, under a row lock.

0. **Idempotency replay** by settlement `idempotencyKey`. A concurrent duplicate is caught by the unique index outside the transaction.
1. **Lock first, read second:** `SELECT … FROM payables WHERE id = … AND tenant_id = … FOR UPDATE`. This serializes concurrent settlements of the same payable.
2. **Read the payable after the lock**, so there is no check-then-act race.
3. The payment account must exist.
4. **Validate** with `assertSettlable` (a pure rule):
   - already `SETTLED`, or balance ≤ 0 → 409 `PayableAlreadySettledException`. This is checked first because "already settled" is a more precise diagnosis than "amount exceeds 0";
   - amount > remaining balance → 400 `SettlementExceedsPayableException`.
5. New balance = `remaining − amount`. Status becomes `SETTLED` at zero, otherwise `PARTIALLY_SETTLED`.
6. Ledger branch and category: the purchase's branch, or the system branch for a central purchase (ADR-014), with category `Pembelian Bahan Baku`.
7. **Expense ledger entry** (`OUTFLOW`, `sourceType: PAYABLE_SETTLEMENT`), dated `settledAt`. This is the moment money actually leaves the account, which is the point of ADR-006.
8. `PayableSettlement` row, then link it back as the entry's `sourceId`.
9. Update the payable's balance and status.
10. Parent `SupplierPurchase.paymentStatus` becomes `PAID` or `PARTIALLY_PAID`.

Transaction options: `maxWait: 10000, timeout: 15000`. Under heavy contention (30 concurrent settlements on one payable, B4), every request queues on the step-1 lock by design. With Prisma's short default `maxWait`, queued transactions failed to start and surfaced as connection errors instead of the clean 409 from `assertSettlable`.

## Errors

| Exception | HTTP | Raised when |
|---|---|---|
| `PayableAlreadySettledException` | 409 | A state conflict: the same request would be valid against a different state |
| `SettlementExceedsPayableException` | 400 | Amount above the remaining balance (matches how allocations report exceeding their cap) |

## Testing

| Layer | File | Covers |
|---|---|---|
| Unit | `payables.rules.spec.ts` | Over-settlement and already-settled, without a database |
| E2E | `test/purchasing-payables.e2e-spec.ts` | Full and partial settlement, ledger timing (ADR-006), RBAC |
| E2E | `test/concurrency.e2e-spec.ts` | Double settlement (exactly one wins), 30-way partial settlements (B4, DEBT-007) |
