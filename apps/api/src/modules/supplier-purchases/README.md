# Supplier Purchases

**Owner module for:** `SupplierPurchase`, `SupplierPurchaseItem`; the **only** writer of `RawMaterial.unitCost` outside master data
**Related:** PRD §8.4 · ERD §3, §6 · System Design §6.2 · ADR-004, ADR-006, ADR-007, ADR-014, ADR-016, ADR-024 · DEBT-006 · Playbook §7

## Overview

A purchase records goods bought from a supplier, either for one branch or centrally (`branchId: null`). It always increments stock, and it moves money only if paid up front.

| Endpoint | Access |
|---|---|
| `POST /supplier-purchases` | `BranchScopeGuard` (`body.branchId`). `ADMIN`/`OWNER` may record central or branch purchases. A `KASIR` may record only incidental purchases for **their own branch**: `null`, missing, or another branch fails closed with 403 |
| `GET /supplier-purchases` | `BranchScopeGuard` (`query.branchId`) |
| `GET /supplier-purchases/:id` | `OWNER`, `ADMIN` only. An id route cannot be branch-scoped without a lookup, and a `KASIR` gets full line details from the list endpoint |

## ADR-006: stock always moves, money sometimes does

The goods have physically arrived, so stock is incremented **unconditionally**. Money is different:

| `paymentStatus` | Writes | Never writes |
|---|---|---|
| `PAID` | `OUTFLOW` `LedgerEntry` (`sourceType: PURCHASE`), linked via `ledgerEntryId` | a `Payable` |
| `UNPAID` | `Payable` (`OPEN`, `remainingBalance = totalAmount`) | a `LedgerEntry`. It is written later by `PayablesService.settle`, for exactly the amount settled |

This is the only `if` on `paymentStatus` in the codebase, and the two outcomes are mutually exclusive (ERD §6). Getting it backwards makes an expense appear before the money left the account, and makes reconciliation match numbers that never hit the bank.

For a central purchase, the ledger entry is attributed to the **system branch** (`resolveLedgerBranchId`), because `LedgerEntry.branchId` is NOT NULL. That is the system branch's only purpose. A purchase that names the system branch directly is rejected (`CentralBranchNotAssignableException`), because it would report `isCentral: false` for something that is central and be quietly wrong in every branch-grouped report. `branchId: null` is the one way to say "central" (ADR-014).

## Purchase lines (ADR-024)

The client sends what the supplier's nota says: a quantity in the material's **purchase unit** and the **total price** paid. The service derives the stock-side figures:

```
quantity (stock units) = purchaseQuantity × conversionFactor      → 4dp HALF_UP
unitCost (per stock unit) = lineTotal ÷ quantity                 → 6dp HALF_UP
totalAmount = Σ lineTotal                                        → 2dp
```

| Value | Rounding | Why |
|---|---|---|
| `quantity` | 4dp | Stored `Decimal(18,4)`, and what `currentStock` is incremented by |
| `unitCost` | **6dp**, not 2 | It is a rate. Rp10.000 over 3.000 g is 3,333333/g, and storing 3,33 would understate that product's HPP by about 0.1% forever |
| `lineTotal` | none | It is the user's input, already at 2dp. `totalAmount` sums exactly the stored values |

Do not "harmonise" these rules with `calculateHpp`'s round-once rule: that function stores nothing intermediate, while all three of these columns persist.

**Each line snapshots the packaging as it is now** (`purchaseUnit`, `conversionFactor`, `purchaseQuantity`). A later edit to the material's packaging must not change what an old nota said. In responses, the purchase-side fields come from the line's snapshot. `unit` is read live from the material, which is safe because the stock unit is immutable once movements exist, and a purchase line always implies a movement.

A zero converted quantity throws `ZeroNormalizedQuantityException`. Zod already rejects zero inputs, so this is unreachable through the API, but a zero divisor must fail loudly rather than write `Infinity` into a decimal column.

## Create flow (`SupplierPurchasesService.create`)

Everything runs in one transaction (Playbook §7).

0. **Idempotency replay** by `(tenantId, idempotencyKey)`. A concurrent duplicate is caught by the unique index `supplier_purchases_tenant_id_idempotency_key_key` and answered with the original purchase.
   - **Backdating:** a `KASIR` may record a purchase at most 3 days back (TASK-087).
1. Supplier must exist.
2. Branch must exist and must not be the system branch (`null` means central).
3. Account must exist, if `PAID`.
4. Every raw material must exist.
5. Normalize each line (`normalizePurchaseLine`) using the factor read in step 4, so there is no window between reading the factor and using it.
6. Create the `SupplierPurchase`.
7. **`applyInbound` (stock in and row locks), BEFORE inserting line items.** `SupplierPurchaseItem.rawMaterialId` has a foreign key, and Postgres takes an implicit `FOR KEY SHARE` lock on the referenced row for every FK-checked insert. When lines were inserted first, two concurrent purchases of the same material each took the (compatible) share lock, then both blocked upgrading to `FOR UPDATE`: a lock-upgrade deadlock (`40P01`), even though the ascending-id order was respected. Locking first means no weaker lock exists to upgrade from (Phase 14, finding B3).
8. Insert the line items.
   - **8b. Latest-cost write-back** (ADR-024, closes DEBT-006). See below.
9. The ADR-006 branch: ledger entry or payable.

### Latest-cost write-back

For each material touched (in ascending id order, matching every lock-ordered loop under ADR-016), `RawMaterial.unitCost` is set to the `unit_cost` of the **latest purchase line by `purchase_date DESC, created_at DESC, id DESC`**.

- It runs while `applyInbound`'s `FOR UPDATE` is still held on every material in the purchase.
- **The winner is recomputed from table state** rather than taken from the row just inserted. A backdated purchase inserts, loses the `ORDER BY` to a newer row, and rewrites `unitCost` to the value it already had. The outcome depends only on `purchaseDate` order, never on which concurrent request finished last (the residual risk DEBT-006 named).
- `created_at` then `id` break ties, so purchases sharing a date resolve to one deterministic winner.
- **This is the only place a stock event reprices a material.** Sales, voids and stock-takes never do (see the stock-movements README).

## Errors

| Exception | HTTP | Raised when |
|---|---|---|
| `PurchaseItemMaterialNotFoundException` | 404 | A line's raw material does not exist |
| `CentralBranchNotAssignableException` | 400 | The purchase names the system branch |
| `BackdatedPurchaseException` | 400 | A `KASIR` backdated more than 3 days |
| `ZeroNormalizedQuantityException` | 400 | The converted stock quantity is zero |

Supplier, branch, account and purchase not-found errors are plain `NotFoundException`s with Indonesian messages.

## Testing

| Layer | File | Covers |
|---|---|---|
| Unit | `purchase-totals.spec.ts` | Conversion, 4dp/6dp rounding, totals |
| E2E | `test/purchasing-payables.e2e-spec.ts` | `PAID` vs `UNPAID` (ADR-006), central purchases, cost write-back, guards |
| E2E | `test/concurrency.e2e-spec.ts` | B3: sale OUT vs purchase IN racing on one material (the lock-upgrade deadlock); B4: concurrent settlements |
| E2E | `test/idempotency.e2e-spec.ts` | Replay and concurrent duplicate keys |
