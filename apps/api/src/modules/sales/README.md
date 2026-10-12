# Sales

**Owner module for:** `Sale`, `SaleItem`
**Related:** PRD §5.2 · ERD §3 · System Design §6.1 · ADR-004, ADR-005, ADR-007, ADR-011, ADR-013, ADR-014, ADR-015, ADR-016, ADR-024 · DEBT-009, DEBT-010 · Playbook §7, §8

## Overview

A sale decrements stock, writes `SaleItem` rows with a frozen per-unit HPP snapshot, and writes the income `LedgerEntry`, all in **one transaction** (Playbook §7). Either everything commits or nothing does.

| Endpoint | Roles | Guards |
|---|---|---|
| `POST /sales` | `KASIR`, `ADMIN`, `OWNER` | `BranchScopeGuard` (`body.branchId`), `RoleGuard` |
| `GET /sales` | any authenticated | `BranchScopeGuard` (`query.branchId`) |
| `GET /sales/:id` | `OWNER`, `ADMIN` | `RoleGuard` |
| `POST /sales/:id/void` | `ADMIN`, `OWNER` | `RoleGuard` |

- `@Roles` lists all three roles on `POST` even though that equals the default, so `grep -rn "@Roles"` is a complete access inventory (Playbook §8: "verified, not assumed").
- `GET /sales/:id` is not open to `KASIR`. An id route carries no branch id, so `BranchScopeGuard` cannot scope it without an extra lookup. A `KASIR` already gets the full sale from the `POST` response and from `GET /sales?branchId=<own>`. This mirrors `GET /supplier-purchases/:id`.
- **The cashier and the voider always come from the JWT.** `CreateSaleSchema` has no `userId` field, so a client cannot attribute a sale to another cashier (`Sale.userId` is an audit trail, ADR-011).

The controller records Prometheus metrics: `saleCreatedTotal`, `saleDurationSeconds`, and `stockConflictTotal` on `InsufficientStockException`.

## Create flow (`SalesService.create`)

The transaction has `timeout: 15000`. A sale can legitimately wait on row locks held by another sale (ADR-016), and Prisma's 5s default would surface a merely queued sale as a P2028/500. 15s absorbs a queue; it is not a retry.

0. **Idempotency replay.** If `idempotencyKey` matches an existing sale for the tenant, return that sale. A concurrent duplicate that slips past this check hits the unique index `sales_tenant_id_idempotency_key_key` and is answered with the original sale, outside the transaction.
1. **Resolve and validate (reads only, no locks):**
   - **Backdating:** a `KASIR` may record a sale at most **3 days** back (TASK-087), otherwise `BackdatedSaleException`.
   - **Branch:** it must exist and must **not** be the system branch. The system branch is a ledger-attribution row, not a till, and a sale there would show in branch reports as an outlet that never sold anything (ADR-004, ADR-014, ADR-015).
   - **Products:** all must exist (404), be active (409), and **have a recipe** (409 `RecipeIncompleteException`). A missing recipe is a different fact from "the recipe costs nothing", and selling at `hppAtSale = 0` would report a 100% margin forever (ADR-013).
   - **Price override:** a `KASIR` may never charge a price that differs from `Product.sellPrice` (DEBT-009). Previously a `KASIR` could submit any `unitPrice`, which was a live path to move money out of the till without the sale looking unusual. The check runs here, before any lock, and uses exactly the same comparison as `resolveUnitPrice()` so the two never disagree on a boundary case.
   - **Stock requirements:** `aggregateStockRequirements` fans the cart out to per-material quantities.
2. **Lock** every material in ascending id order **before** reading any `unitCost` or `currentStock` (ADR-016). This is what makes two concurrent sales, or a sale and a purchase, touching the same materials either serialize cleanly or fail with `InsufficientStockException`: they never deadlock and never corrupt the balance.
3. **Compute and write:**
   - Per line: resolve the unit price, compute `lineTotal`, and snapshot `hppAtSale` with **the same `calculateHpp`** the Products module uses, from the locked costs **and the product's `wastePercent`** (ADR-024). A second implementation, or omitting waste, would make the snapshot drift from the live HPP shown in master data (ADR-005).
   - Create the income `LedgerEntry` (`INFLOW`, `sourceType: SALE`, category from `resolveSaleCategoryId`), then the `Sale`, then the `SaleItem`s.
   - `applyOutbound` checks every material and throws `InsufficientStockException` before writing any movement. The transaction then rolls back everything above.
   - Link the ledger entry back to the sale (`sourceId`). The entry is created before the sale exists, because `Sale.ledgerEntryId` is required.

## Money rules

| Value | Rule | Why |
|---|---|---|
| `unitPriceAtSale` | Override if given, otherwise `sellPrice` | — |
| `isPriceOverridden` | `true` only if an override was given **and** it differs from `sellPrice` | Sending the master price explicitly is not a discount, and flagging it would add noise to every "which sales were discounted" query (ADR-015) |
| `lineTotal` | `quantity × unitPrice`, rounded to 2dp `HALF_UP` **per line** | It is a stored `Decimal(18,2)` column |
| `totalAmount` | Sum of the **already-rounded** line totals | It must equal the sum of what is stored (same rule as purchases) |
| `hppAtSale` | **Per-unit** HPP snapshot at sale time | Never recomputed later (ADR-005, ADR-015) |
| `totalHpp` (response only) | Exact `Σ hppAtSale × quantity`, rounded **once** | Not stored, so nothing intermediate is rounded (same rule as `calculateHpp`) |
| Stock requirement | Exact `Σ quantity × quantityUsed` per material, rounded **once** to 4dp | This total is what `StockMovement.quantity` stores; rounding per line and then summing drifts |

**Do not "harmonise" the `lineTotal` and `totalHpp` rounding rules.** They answer different questions: one sums stored values, the other is a pure derivation.

`totalHpp` and `grossMargin` are computed in `sales.mapper.ts` from the stored `hppAtSale` snapshots, never from a live recipe. This makes the per-unit convention of ADR-015 observable at the API boundary.

## Void (`SalesService.void`, DEBT-010)

This is a **minimal interim** void, not a refund workflow: `ADMIN`/`OWNER` only, a full reversal only, and only within **30 minutes** of `soldAt`. Anything older needs a real refund workflow.

- **The original rows are never edited or deleted.** `Sale`, `SaleItem` and `LedgerEntry` are financial history (ERD §3). A void writes reversal rows instead:
  - an inbound `StockMovement` through `applyInbound` with `referenceType: 'SALE'` (reused on purpose, see the stock-movements README);
  - an `OUTFLOW` ledger entry with `sourceType: 'SALE_VOID'`. The dedicated source type is for audit legibility only;
  - `Sale.status = VOIDED` plus `voidedAt` and `voidedByUserId`.
- **Concurrency:** the sale row is locked with `SELECT … FOR UPDATE`, then its status is re-checked, so two concurrent voids serialize (the same lock-then-recheck shape as `AllocationService.revoke`). `id` is `TEXT`: do not add a `::uuid` cast.
- **Excluding voided revenue from reports is not this method's job.** It lives in `reports/report-filters.ts` (`saleScope`) and the ledger-to-sales joins in `reports.service.ts`. See the Reports README for why a status flip alone is not enough.

## Errors

| Exception | HTTP | Raised when |
|---|---|---|
| `SaleProductNotFoundException` | 404 | A cart product id does not exist |
| `InactiveProductException` | 409 | A product is deactivated |
| `RecipeIncompleteException` | 409 | A product has no recipe (ADR-013) |
| `InsufficientStockException` | 409 | Not enough stock (raised by stock-movements) |
| `CentralBranchNotSellableException` | 400 | The sale names the system branch |
| `BackdatedSaleException` | 400 | A `KASIR` backdated more than 3 days |
| `PriceOverrideNotAllowedException` | 400 | A `KASIR` overrode a price. `RoleGuard`-level role checks stay authoritative; this is what a `KASIR`'s own attempt surfaces as |
| `SaleAlreadyVoidedException` | 400 | A second void, including a race against the first |
| `SaleVoidWindowExpiredException` | 400 | The sale is older than 30 minutes |

## Testing

| Layer | File | Covers |
|---|---|---|
| Unit | `sale-totals.spec.ts` | Both rounding rules, override flagging |
| Unit | `sale-stock.calculator.spec.ts` | Fan-out, 4dp single rounding, **lock order** (ADR-016 without a database) |
| E2E | `test/sales.e2e-spec.ts` | Full create/void flow, guards, snapshots |
| E2E | `test/concurrency.e2e-spec.ts` | Oversubscribed concurrent sales, deadlock probe, shared pool across branches |
| E2E | `test/idempotency.e2e-spec.ts` | Replay and concurrent duplicate keys |
