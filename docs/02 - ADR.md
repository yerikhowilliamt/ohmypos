# OhMyPos — Architecture Decision Records

**Status:** Draft v2
**Depends on:** PRD v1.1, System Design v4, ERD v3

**Changelog (v1 → v2):** Added ADR-012, recording the field-level baseline for the seven ported tables after Kasync's literal `schema.prisma` was read for the first time. No existing ADR is superseded — ADR-012 amends ERD v2 → v3, which ERD §7 had already flagged as needing exactly this cross-check.

---

## ADR-001: OhMyPos is a new repo that ports Kasync's module patterns, rather than extending Kasync or calling it via API

**Status:** Accepted

**Context:** Kasync is a standalone, ~99%-complete reconciliation engine, already positioned as an independent portfolio piece. OhMyPos needs the same financial primitives (`Account`, `LedgerEntry`, `Allocation`, `MatchingEngine`) plus new POS-specific domains, and `Sale` creation needs to atomically touch both stock and ledger state.

**Decision:** OhMyPos is built as a new, separate repository. Kasync's modules are copied and adapted into it directly (not called over HTTP), while Kasync itself is left running and deployed unchanged.

**Consequences:**

- Kasync remains a clean, standalone portfolio artifact — its scope and story don't get diluted by becoming "a module inside someone's POS system."
- `Sale` creation can wrap stock + ledger writes in one database transaction (see ADR-007), avoiding a distributed-transaction problem entirely.
- Trade-off: some code duplication between Kasync and OhMyPos for the ported modules — accepted as a small cost for a small, single-developer scope.

**Alternatives considered:**

- _Extend Kasync in place_: rejected — conflates a single-tenant portfolio piece with a business-specific POS app, and risks the two use cases pulling the schema in different directions over time.
- _Separate OhMyPos service calling Kasync's API_: rejected — turns every sale into a distributed transaction (partial failure, retries, idempotency) for no real benefit at this scale.

---

## ADR-002: Monorepo with Next.js frontend decoupled from the NestJS backend via REST

**Status:** Accepted

**Context:** OhMyPos needs both a backend (financial/inventory logic) and a frontend (POS + back-office UI). Kasync already established a precedent: a Next.js frontend that consumes its NestJS API purely over REST, with no backend logic in Next.js API routes (Kasync ADR-007).

**Decision:** OhMyPos is a single monorepo (`apps/api`, `apps/web`, shared `packages/*`), using pnpm workspaces + Turborepo. The frontend calls the backend only over REST, using shared types from `packages/api-contracts`. The frontend never accesses the database directly.

**Consequences:**

- One repo, one place to review the whole feature end-to-end, one CI pipeline — appropriate for a single developer.
- Backend business logic (transactions, locking, validation) stays in one place (`apps/api`) and can't be bypassed by the frontend.
- Requires discipline to keep `packages/api-contracts` in sync with the backend (tracked as a risk in System Design — see ADR-008 below for the mitigation path).

**Alternatives considered:**

- _Two separate repos (frontend, backend)_: rejected — adds repo-management overhead with no benefit for a single-developer project; Kasync's own frontend/backend split didn't require separate repos either.
- _Next.js API routes as the backend_: rejected — would duplicate business logic across two places or force the "real" backend logic into Next.js, contradicting the modular-monolith design already decided for the domain logic.

---

## ADR-003: Continue using Prisma as the ORM

**Status:** Accepted

**Context:** Kasync uses Prisma over Sequelize/TypeORM, originally chosen partly to showcase a skill not otherwise on the author's CV. OhMyPos ports Kasync's modules directly, including their Prisma schema definitions and migration patterns (e.g. the allocation-sum trigger, the `FOR UPDATE` lock pattern).

**Decision:** OhMyPos uses Prisma, matching Kasync.

**Consequences:**

- Ported modules can be adapted with minimal friction — same schema conventions, same migration tooling, same query patterns for row-locking.
- Consistency across both portfolio projects reinforces the same skill demonstration Kasync's own ADR was aiming for.

**Alternatives considered:**

- _Switch ORMs for OhMyPos_: rejected — would mean re-deriving the trigger-based allocation-sum constraint and the `FOR UPDATE` lock pattern in a different ORM's idioms, for no functional benefit.

---

## ADR-004: Centralized stock and cash, with per-branch attribution via `branchId`

**Status:** Accepted

**Context:** The business owner confirmed (PRD Section 8): raw material stock is centralized at one central kitchen, cash settles to one central account, and menu/pricing is identical across branches. However, cash arriving in the shared account is sometimes hard to attribute back to the branch that generated it — the core problem the reconciliation module exists to solve.

**Decision:** `RawMaterial.currentStock` and `Account` remain single, unpartitioned pools — no per-branch stock or per-branch account tables. `branchId` is still recorded on transactional records (`Sale`, `LedgerEntry`, `SupplierPurchase`) purely for attribution and reporting, not as a data-partitioning key.

**Consequences:**

- Simpler schema than a fully general per-branch model — no need to reconcile stock or cash _across_ branches, only to attribute shared totals back to their source.
- The `Allocation` module (ported from Kasync) becomes the mechanism for resolving the cross-branch cash-mixing problem: one bank deposit can be split-allocated across multiple branch-tagged `LedgerEntry` records.
- If the business later opens branches with independent stock or banking (a real possibility for a growing multi-branch business), this is a schema migration, not a config toggle — accepted as a reasonable v1 trade-off given the confirmed current policy.

**Alternatives considered:**

- _Per-branch stock and per-branch account tables from day one_: rejected — the business owner explicitly confirmed the current policy is centralized; building for a hypothetical future policy now would add schema and query complexity with no present-day payoff.

---

## ADR-005: HPP is computed live on `Product`, but snapshotted on `SaleItem`

**Status:** Accepted

**Context:** Dashboard 1 (master data) needs to show each product's current cost of goods sold, which changes whenever a raw material's unit cost changes. Dashboard 3 (P&L reporting) needs historical accuracy — a sale from last month must not silently change its recorded margin because a raw material got more expensive this month.

**Decision:** `Product.hpp` is computed on read from the current `Recipe` and `RawMaterial.unitCost`. `SaleItem.hpp` is computed once, at the moment of sale, and stored — never recalculated afterward.

**Consequences:**

- Historical P&L and per-product profit reports remain accurate regardless of later price changes.
- Requires the `Sale` creation flow to always compute and persist this value explicitly (see System Design 6.1) — a step that must not be "optimized away" later without re-examining this ADR.

**Alternatives considered:**

- _Always compute HPP live, even for historical sales_: rejected — would silently rewrite historical profit figures whenever ingredient prices change, undermining the accuracy goal in PRD Section 9.

---

## ADR-006: Supplier debt (`Payable`) only becomes a `LedgerEntry` at settlement, not at purchase

**Status:** Accepted

**Context:** Raw material purchases can be paid immediately or bought on credit (utang). Recording an expense `LedgerEntry` at purchase time for unpaid purchases would show cash leaving the business before it actually has.

**Decision:** An unpaid `SupplierPurchase` increments stock immediately (the goods have arrived) and creates/increments a `Payable` balance, but does **not** create an expense `LedgerEntry`. A `LedgerEntry` is created only when a `PayableSettlement` records an actual payment.

**Consequences:**

- Cash-based reports (P&L, daily income, reconciliation) always reflect money that has actually moved, matching the reconciliation module's purpose.
- Stock and financial state can be briefly "out of sync" from a naive perspective (stock is already up, but no expense is recorded yet) — this is intentional and must be understood by anyone building reports against these tables.

**Alternatives considered:**

- _Record the expense LedgerEntry at purchase time regardless of payment status_: rejected — distorts cash-based reporting and would make the "Reconciliation" module reconcile against numbers that don't correspond to real bank activity.

---

## ADR-007: Row-level lock (`SELECT ... FOR UPDATE`) on `RawMaterial` during sale-time stock decrement

**Status:** Accepted

**Context:** Stock is a single shared pool across all branches (ADR-004). Multiple branches can sell products consuming the same raw material concurrently, creating a race condition if two sales read-then-write the stock balance without synchronization — this is the same class of problem Kasync solved for its allocation-sum trigger.

**Decision:** Before decrementing `RawMaterial.currentStock` inside the `Sale` creation transaction, take a row-level lock on the raw material row (`SELECT ... FOR UPDATE`), mirroring the fix already applied in Kasync's allocation trigger.

**Consequences:**

- Correct stock balances under concurrent sales from different branches, at the cost of some lock contention on hot raw materials.
- Acceptable at the business's actual transaction volume (flagged as a risk to revisit in System Design Section 11 if volume grows significantly).

**Alternatives considered:**

- _Optimistic concurrency (version column, retry on conflict)_: rejected for v1 — adds retry-handling complexity in the `Sale` flow for a problem the simpler pessimistic lock already solves at this scale.
- _No locking (accept the race)_: rejected outright — stock and financial accuracy are core goals (PRD Section 3), not areas to cut corners on.

---

## ADR-008: Reports computed at query time in v1; no materialized views yet

**Status:** Accepted

**Context:** Dashboard 3 and Dashboard 5 need aggregated, near-real-time figures (P&L, top products, inventory summary). Kasync's own reconciliation dashboard already uses query-time aggregation successfully at its transaction volume.

**Decision:** All OhMyPos reports are computed by querying `LedgerEntry`, `SaleItem`, and `StockMovement` directly at request time. No materialized views, snapshot tables, or scheduled aggregation jobs in v1.

**Consequences:**

- Simplest possible implementation, no cache-invalidation logic to maintain, reports are always exactly consistent with the underlying ledger/stock data.
- If report query latency becomes a problem once real data volume is known, this ADR should be revisited (materialized views or a dedicated read-model table) — tracked as a risk in System Design Section 11, not assumed to be permanent.

**Alternatives considered:**

- _Materialized views or a read-model table from the start_: rejected for v1 — premature optimization for a data volume that isn't yet known, and adds real implementation and consistency-maintenance cost.

---

## ADR-009: Hand-written shared API contract types in `packages/api-contracts` (not code-generated, for now)

**Status:** Accepted, provisional

**Context:** The monorepo (ADR-002) needs a single source of truth for request/response shapes shared between `apps/api` and `apps/web`, to prevent type drift.

**Decision:** Start with hand-written TypeScript types in `packages/api-contracts`, manually kept in sync with the NestJS DTOs.

**Consequences:**

- Zero extra build tooling to get started; fast to set up for v1.
- Relies on developer discipline to keep the shared types in sync — acceptable risk for a single-developer project, but explicitly flagged (System Design Section 11) as something to revisit.

**Alternatives considered:**

- _Generate types from the NestJS OpenAPI spec (e.g. `openapi-typescript`)_: deferred, not rejected — a reasonable v2 upgrade once the API surface stabilizes enough that regenerating shared types isn't premature. Adopting it later should get its own ADR, since it changes the build pipeline.

---

## ADR-010: Zod as the single shared validation and type source, on both backend and frontend
 
**Status:** Accepted (supersedes ADR-009)
 
**Context:** ADR-009 assumed hand-written TypeScript types kept in sync with the backend by developer discipline alone — types with no attached runtime validation, and a design that requires remembering to update both sides on every change. Separately, NestJS's default validation approach (`class-validator` + `class-transformer` DTOs) is itself just another type definition that would need to stay in sync with whatever `packages/api-contracts` declares — a third place for the same shape to drift.
 
**Decision:** Define every request/response shape once, as a Zod schema, in `packages/api-contracts`. Both `apps/api` and `apps/web` import these schemas directly:
- **Backend**: use the Zod schemas for request validation (replacing `class-validator` DTOs), so an invalid request is rejected using the exact same rule the frontend was built against.
- **Frontend**: use the same Zod schemas for form/input validation before a request is even sent, giving immediate feedback with zero duplicate rule-writing.
- TypeScript types are derived from the schemas via `z.infer<typeof schema>` — the type is a byproduct of the validation rule, not a separate artifact to maintain.
**Consequences:**
- Eliminates type drift *by construction*, not by discipline — closes the exact gap ADR-009 left open as a risk.
- One less concept to hold in your head: no separate DTO classes on the backend, no separate hand-written interface on the frontend, no OpenAPI generation step — just Zod schemas, imported.
- Validation error messages can be shared/consistent across backend rejections and frontend form errors, since they come from the same schema definitions.
- Requires picking a NestJS-side integration approach for wiring Zod into the request pipeline (e.g. a custom `ZodValidationPipe` or an existing library such as `nestjs-zod`) — a small implementation detail to settle when `apps/api` scaffolding begins, not architecturally significant enough for its own ADR.
**Alternatives considered:**
- *ADR-009's hand-written types*: superseded — see Context above.
- *`class-validator` DTOs on the backend + separately hand-written or generated frontend types*: rejected — this is effectively two sources of truth for the same shape (or three, counting the frontend), which is exactly the drift risk Zod avoids by being usable directly on both ends.

---

## ADR-011: Authentication & Role-Based Access Control (Kasir / Admin / Owner)

**Status:** Accepted

**Context:** OhMyPos is single-tenant (one business), but requires staff-level login with three distinct roles: Kasir, Admin, Owner. Kasync's own Auth module was audited via its state export (kasync-state-export.md) and found to have added multi-tenant user isolation late, outside its original PRD — a drift OhMyPos avoids by deciding Auth scope upfront as its own ADR, before implementation.

Unlike Kasync, OhMyPos has no Business entity — all staff belong to the same business, differentiated only by role and branchId.

**Decision:** 
1. User.role is enum(KASIR, ADMIN, OWNER) — extends the ERD's existing User entity (previously drafted as OWNER, CASHIER only; ADMIN added here, CASHIER kept as-is to match ERD naming).
2. User.branchId (already in ERD, nullable) — required when role = KASIR, null when role = ADMIN or OWNER (unscoped, all-branch access).
3. Auth pattern ported from Kasync: JWT access + refresh token, password hash, tokenValidFrom for session revocation on logout/credential change.
4. Two guards combine to enforce access: a RoleGuard (checks role against endpoint's allowed roles) and an extended BranchScopeGuard (System Design Section 8) — if role = KASIR, every request is scoped to user.branchId; Admin/Owner bypass branch scoping.
5. Only OWNER can create/deactivate User records — no self-registration, no approval workflow (Admin cannot create users).
6. Reconciliation matching (Allocation create/revoke) is restricted to ADMIN and OWNER via the same RoleGuard.
7. Sale.userId (already in ERD as "cashier who made the sale") satisfies the audit requirement of recording which staff member processed each sale — no separate processedByUserId field needed.

**Consequences:**

- (+) No multi-tenant Business layer needed — matches OhMyPos's confirmed single-business scope.
- (+) Kasync's proven Auth pattern (JWT + tokenValidFrom) is reused directly, lowering implementation risk.
- (+) Sale.userId already provides per-sale staff accountability without schema changes.
- (−) branchId nullability requires strict discipline in BranchScopeGuard — every Kasir-facing endpoint touching Sale, StockMovement, or branch-scoped LedgerEntry reads must apply it, not just some.
- (−) Owner-only user creation is a single point of failure for staff onboarding — accepted given the small-team scale of a single business.

**Alternatives considered:**

* Admin can create users with Owner approval workflow: considered, then rejected in favor of simpler Owner-only creation — no pending-approval state or notification infrastructure needed.
* Multi-tenant Business entity for future resale: rejected — OhMyPos is confirmed single-business; adding this now would repeat Kasync's own late-multi-tenancy drift problem in reverse (building for a hypothetical need not yet real).

---

## ADR-012: Ported tables take Kasync's literal `schema.prisma` as their baseline

**Status:** Accepted

**Context:** ERD v2 §7 left an explicit open item: its ported-entity field definitions were written from Kasync's documented ADRs/ERD, not from Kasync's actual schema file, and needed cross-checking before implementation. That cross-check has now been done against `../kasync/prisma/schema.prisma` and every file in `../kasync/prisma/migrations/`.

The differences turned out to be material rather than cosmetic. Three of them are load-bearing:

- Kasync's `TransactionStatus` has four values (`UNRESOLVED`, `PENDING_REVIEW`, `PARTIALLY_ALLOCATED`, `MATCHED`); ERD v2 listed three different ones. The `trg_sync_transaction_status` trigger writes those literals directly, and `PENDING_REVIEW` is the state `MatchingService` moves transactions into when it proposes a match.
- Kasync uses a single shared `TransactionType {INFLOW, OUTFLOW}` enum for both `BankTransaction` and `LedgerEntry`, and both `AllocationService.create` and `MatchingEngine` compare the two directly (`bankTransaction.type !== ledgerEntry.type` is a rejection). ERD v2 specified `enum(INCOME, EXPENSE)` for `LedgerEntry` only, which would break that comparison.
- `BankTransaction.externalRef`/`dedupHash` (with their two unique constraints) and `Allocation.idempotencyKey` are absent from ERD v2 entirely, but carry the CSV import de-duplication and the idempotent allocation-creation behaviour respectively.

Separately, every ported Kasync table carries a `userId` foreign key with user-scoped unique constraints, and every ported service method takes a `userId` scoping parameter — a multi-tenancy layer ADR-011 already decided OhMyPos does not have.

**Decision:**

1. **For the seven ported tables, Kasync's literal schema is the baseline**, and ERD v2's ported-entity definitions are corrected to match it (ERD v3). OhMyPos-specific requirements are layered on top of that baseline rather than replacing it.
2. **`TransactionType {INFLOW, OUTFLOW}` is retained** as the single shared direction enum, used by `BankTransaction`, `LedgerEntry`, and `Category.type`. The Indonesian-language product vocabulary (pemasukan/pengeluaran) maps to it at the presentation layer, not in the schema.
3. **`TransactionStatus`'s four values are retained verbatim**, so Kasync's triggers port without being re-derived.
4. **Kasync fields that carry behaviour are retained**: `BankTransaction.type`, `externalRef`, `dedupHash`, `importedAt`; `Allocation.idempotencyKey`, `revokedAt`; and their unique constraints. `Allocation` keeps `createdAt` only — it has no `updatedAt`.
5. **The multi-tenant `userId` FK is dropped** from `Account`, `Category`, `Branch`, and `LedgerEntry`, and every ported service loses its `userId` scoping parameter (ADR-011 — single business, no tenant isolation).
6. **OhMyPos additions layered on top:** `LedgerEntry.accountId` (required), `sourceType`, `sourceId`; `Account.openingBalance`; `Category.type`; `Branch.address`; `createdAt`/`updatedAt` on `Category` and `Branch`; `User.isActive`.
7. **Decimal precision:** monetary values use `Decimal(18, 2)`, matching Kasync. Quantity values use `Decimal(18, 4)` — 2 decimal places cannot represent realistic recipe quantities in kg or liter.

**Consequences:**

- Kasync's allocation-sum trigger, its transaction-status sync trigger, its import de-duplication, and its allocation idempotency all port across unchanged — which is what System Design §6.5 assumes when it says the reconciliation invariant is enforced "the same way, unchanged."
- ERD v3 becomes trustworthy as an implementation target: any field it marks as new really is absent from Kasync, and anything it doesn't mark really can be copied.
- (−) `LedgerEntry.categoryId` stays **required** (Kasync's shape), so the seed must provide system categories for the entries `Sale` and `PayableSettlement` generate automatically — a sale cannot create an uncategorised ledger entry.
- (−) The codebase says `INFLOW`/`OUTFLOW` while the product speaks pemasukan/pengeluaran, leaving a translation step in the UI layer. Logged as DEBT-003 rather than hidden.
- (−) Porting is now explicitly an adaptation, not a copy: stripping `userId` touches every method of every ported service. This raises Phase 1's effort estimate and means Kasync's ported tests need rewriting, not just re-pointing.

**Alternatives considered:**

- _ERD v2's definitions win; adapt Kasync's code to them_: rejected — the three-value `TransactionStatus` would force `trg_sync_transaction_status` to be rewritten rather than copied verbatim, and dropping `externalRef`/`dedupHash`/`idempotencyKey` would silently delete import de-duplication and allocation idempotency along with the fields.
- _Two separate direction enums (`INFLOW/OUTFLOW` for bank, `INCOME/EXPENSE` for ledger) with a mapping layer_: rejected — semantically tidier, but it inserts a conversion into every bank↔ledger comparison, which is the single most correctness-critical path in the reconciliation engine.


---

## ADR-013: Product has no stock; POS shows derived advisory makeable quantity, and HPP stays recipe-based

**Status:** Accepted

**Context:** DEBT-005 highlighted a conflict between the Claude Design mockup (`OhMyPos App.dc.html`) and the system's stock and costing architecture (ADR-004, ADR-005, ADR-007). The mockup showed a per-product stock counter ("Es Kopi Susu ... 48") and stated inventory valuation is "dihitung dari HPP rata-rata bergerak" (moving-average cost).

In OhMyPos, stock is centralized in `RawMaterial` (ADR-004) and decremented under `FOR UPDATE` pessimistic row lock at sale time (ADR-007). `Product` has no stored stock field. Furthermore, ADR-005 defines HPP as recipe-based (computed live from `RecipeItem.quantityUsed × RawMaterial.unitCost`), which is snapshotted onto `SaleItem.hppAtSale` at sale time.

**Decision:**
1. **No per-product stock stored:** `Product` has no `stock` or `currentStock` column. The POS displays a **derived, advisory makeable quantity**:
   `makeableQty(product) = floor( min over recipeItems of ( rawMaterial.currentStock / recipeItem.quantityUsed ) )`
   This is computed live on read queries. If a product has no recipe, `makeableQuantity` is `null`. It is a visual hint, never authoritative, and never reserved. Actual stock availability is strictly enforced at sale time by raw material locks (ADR-007).
2. **HPP stays recipe-based per ADR-005:** Moving-average costing is explicitly rejected. HPP is computed live at query time from `RecipeItem.quantityUsed × RawMaterial.unitCost`, rounded once `HALF_UP` to 2 decimal places. `DESIGN.md`'s mockup copy is corrected to match.
3. **No `hpp` column stored on `Product`:** HPP is computed live via `hpp.calculator.ts` (Option A). A product without a recipe returns `hpp: null` and `hasRecipe: false`.

**Consequences:**
- (+) Guarantees zero staleness for live HPP when raw material costs change.
- (+) Reuses identical `calculateHpp` logic for both live master data reads and Phase 5 `SaleItem.hppAtSale` snapshots.
- (+) Preserves ADR-004's single centralized raw material stock pool without introducing duplicate product-level stock fields.
- (−) Every product read query joins `recipe_items` and `raw_materials`. Solved via eager single `include` query; negligible overhead at master data scale.

**Alternatives considered:**
- *Per-product stored stock field*: rejected — creates a dual stock model that contradicts ADR-004.
- *Moving-average costing*: rejected — violates ADR-005 and produces conflicting figures across Dashboard 3 reports.
- *Stored `Product.hpp` recomputed on write*: rejected — introduces complex fan-out cache invalidation when `RawMaterial.unitCost` changes and violates ERD §3.

---

## ADR-014: Central kitchen branch for central-purchase ledger entry attribution

**Status:** Accepted

**Context:** ERD v3 §3 and ADR-004 establish that `SupplierPurchase.branchId` is nullable, where `branchId = null` is the canonical marker for a "central purchase" (bought centrally by the business for raw materials/packaging). However, `LedgerEntry.branchId` is a required (`NOT NULL`) column inherited from Kasync's schema baseline (ADR-012).

A central purchase paid up front (`paymentStatus = PAID`) or settled later via a `PayableSettlement` must create an expense `LedgerEntry`. Because `LedgerEntry.branchId` is `NOT NULL`, the entry requires a branch to attribute the movement to.

**Decision:**
1. **`SupplierPurchase.branchId = null` remains the canonical and only way to record a central purchase.** The API never accepts a central branch ID from the client for `SupplierPurchase`.
2. **Seed a system branch named `Pusat (Dapur Sentral)`.** When generating a `LedgerEntry` from a central purchase or central payable settlement, the service resolves the branch ID for `Pusat (Dapur Sentral)` and assigns it to `LedgerEntry.branchId`.
3. **`LedgerEntry.branchId` remains `NOT NULL`**, preserving the ported table schema baseline (ADR-012) and ensuring all financial entries remain allocatable and attributable in reconciliation.

**Consequences:**
- (+) Preserves ADR-012: no modifications to the ported `LedgerEntry` schema structure.
- (+) Reflects real-world business operation: the central kitchen is an actual physical location (PRD §8.1).
- (+) Reconciliation and split-allocation work without special-case null-branch handling.
- (−) Two representations of "central" exist (`SupplierPurchase.branchId = null` vs `LedgerEntry.branchId = <Pusat>`). Mitigated two ways: the attribution is generated only inside system-entry creation (`resolveLedgerBranchId`), and `SupplierPurchasesService.create` rejects a purchase whose `branchId` resolves to `Pusat (Dapur Sentral)` with `CentralBranchNotAssignableException` (400). The rejection is enforced, not merely documented — a purchase attributed to `Pusat` directly would report `isCentral: false` while being central, which is quietly wrong in every branch-grouped report. Covered by Case 28 in `test/purchasing-payables.e2e-spec.ts`.
- (−) Database seed becomes load-bearing for central ledger entry creation; missing seed yields an explicit 500 error directing developer/admin to run `db:seed`.

**Alternatives considered:**
- *Make `LedgerEntry.branchId` nullable*: rejected — changes ported table baseline (ADR-012), complicates query-time reporting aggregations with null buckets, and alters `BranchScopeGuard` semantics.
- *Require client to provide a separate ledger branch ID for central purchases*: rejected — confuses clients and leaks internal accounting rules into the public API.


---

## ADR-015: `Sale.totalAmount` is the sum of line totals; `SaleItem.hppAtSale` is per-unit; stock fan-out is aggregated per raw material

**Status:** Accepted

**Context:** Phase 5 builds the `Sale` flow, and three questions had to be settled before the first row could be written — each of them silently irreversible once sales exist, because a stored row does not record which convention wrote it.

1. **What `totalAmount` means.** DEBT-004 recorded that the approved mockup renders an 11% tax line and a `MEMBER10` discount code, neither of which has a field in ERD v3. DEBT-004 itself required tax and discount to be decided *together and before* `Sale` was built, because both change the definition of the total that every Dashboard 3 report reads.
2. **What `SaleItem.hppAtSale` stores.** ERD §3 says "snapshot per ADR-005" without stating whether the number is the per-unit cost or the line-extended cost. The two differ by a factor of `quantity`, and a report author who assumed the wrong one would produce a COGS figure wrong by orders of magnitude with nothing to flag it.
3. **How many `StockMovement` rows one sale writes.** A cart can reach the same raw material through several products, or through the same product twice on two lines at different prices.

**Decision:**

1. **No tax, no discount, no order type in v1.** `Sale.totalAmount` is exactly `Σ SaleItem.lineTotal`. There is no `subtotal`, `discountAmount`, `taxAmount`, `taxRate`, discount-code table, or `orderType` column. Discounts and negotiated prices are recorded through the per-line price override that PRD §5.2 already specifies for this purpose: `unitPriceAtSale` is what the customer actually paid and `isPriceOverridden` marks that it diverged from the master price. The income `LedgerEntry.amount` therefore equals `Sale.totalAmount` with no gross-versus-net distinction anywhere.
2. **`SaleItem.hppAtSale` is the PER-UNIT HPP** at the moment of sale — the same number `Product.hpp` shows live, produced by the same `calculateHpp` call. COGS for a line is `hppAtSale × quantity`; the column is not the line-extended cost.
3. **One `StockMovement` per distinct raw material per sale**, with quantities summed across every contributing line. The per-material total is computed by summing the *exact* products `quantity × quantityUsed` and rounding **once** to 4dp `HALF_UP` — rounding per line and then summing drifts, and the drift lands in `RawMaterial.currentStock` where it never washes out.

**Consequences:**

- (+) Decision 2 lets the `Sale` flow call `calculateHpp` verbatim, which is what ADR-005's consequence section demands: the live figure and the snapshot must never become two implementations that can drift.
- (+) Decision 3 keeps the lock set, the sufficiency check, and the decrement one-to-one with each other. A material appearing twice would otherwise be checked against a balance the first decrement had already moved.
- (+) Gross margin is `totalAmount − Σ(hppAtSale × quantity)`, with no tax to exclude and no discount to add back — Phase 7 reads one number.
- (−) A "total discounts given" report is not computable in v1: only the charged price is snapshotted, not the master price at sale time. If that report is ever wanted, the cheap addition is a `masterPriceAtSale` column, not a discount model.
- (−) Per-`SaleItem` stock traceability is lost. `StockMovement.referenceId` points at the `Sale` and there is no `saleItemId` column, so per-line granularity would record detail that cannot be read back. Recovering it later is an additive column, not a rewrite.
- (−) Decision 1 leaves the approved mockup's tax and discount lines unimplemented. Rendering them as static UI would promise behaviour the system does not have, which DEBT-004 already judged to be worse than omitting them.

**Alternatives considered:**

- *Sale-level `subtotal`/`discountAmount`/`taxAmount` columns*: rejected for v1 — nothing in the PRD, System Design, any ADR, or the ERD asks for tax; it exists only in the mockup. Adding it would split every Phase 7 revenue figure into gross and net for no requirement.
- *Full tax-rate and discount-code model*: rejected — largest schema surface, and it would need its own ADR for how tax interacts with COGS and margin.
- *Line-extended `hppAtSale`*: rejected — it folds a quantity into a column named like a unit cost, and it would prevent reusing `calculateHpp`, which is the specific outcome ADR-005 exists to prevent.
- *Nullable `hppAtSale` so recipeless products can be sold*: rejected — pushes a null into every COGS aggregation in Phase 7 and turns one clear error at sale time into a silent gap in every report. A product with no recipe is rejected instead, with `RecipeIncompleteException` (Playbook §6 already names it).
- *One `StockMovement` per (sale line, raw material)*: rejected — two rows with the same `referenceType` and `referenceId` for the same material are indistinguishable when read back.

---

## ADR-016: Raw-material row locks are acquired in ascending `rawMaterialId` order, all before any mutation

**Status:** Accepted

**Context:** ADR-007 established that `RawMaterial.currentStock` is decremented under a `SELECT ... FOR UPDATE` row lock, and closed the read-then-write race. It did not say anything about *ordering*, because at the time only one flow took those locks and its line list was short.

Phase 5 changes that. A sale of N products fans out through `RecipeItem` to M distinct raw materials, where M is neither supplied by the client nor derivable from the request without reading the recipes. Two concurrent transactions that lock the same two materials in opposite order deadlock: PostgreSQL aborts one with `40P01`, which surfaces to a cashier as a 500 they cannot act on, non-deterministically, at the busiest moment of the day. Under the obvious per-line implementation the lock order is the customer's cart order — so this is not a bug that care prevents, it is a bug the customer chooses.

Three flows now lock `raw_materials`: `SupplierPurchasesService.create` (via `StockMovementsService.applyInbound`), `SalesService.create`, and `StockMovementsService.applyOutbound`. A central purchase and a branch sale genuinely run at the same time, so the ordering has to hold *across* flows, not just within one.

**Decision:**

1. **Every transaction that locks `raw_materials` acquires all of its locks before any mutation, in ascending `rawMaterialId` order.** No exceptions, no flow-local ordering.
2. **The lock loop lives in exactly one function** — `StockMovementsService.lockRawMaterialsInIdOrder(tx, ids)` — called by `applyInbound`, by `applyOutbound`, and by `SalesService` before it reads `unitCost` for the HPP snapshot. Two copies of an invariant are two places to get it wrong.
3. **Locks are acquired before the first read of `unitCost` or `currentStock`**, not merely before the decrement, so a sale's HPP snapshot and its stock decrement see the same version of the same rows. A concurrent master-data price edit can otherwise produce a `hppAtSale` that never coexisted with the balance that was decremented.
4. **The ordering is produced by a pure function** (`aggregateStockRequirements`, which returns its entries sorted) so that it is asserted by a unit test with no database, rather than resting on a comment.

**Consequences:**

- (+) Deadlock between any two stock-touching transactions is unreachable by construction: a cycle cannot form when every participant takes locks in the same total order. Contending transactions queue instead of one being aborted.
- (+) The rule holds between a sale and a purchase, not just between two sales.
- (+) The correctness of the ordering is testable at two levels: a unit test on the calculator's output, and an e2e test firing overlapping carts concurrently and asserting zero 500s.
- (−) The lock phase costs one round trip per distinct raw material. At a realistic cart (≤ 8 products → ≤ 15 materials) this is single-digit milliseconds inside a transaction that already runs ~10 statements.
- (−) `applyInbound` changed from interleaved lock/write to lock-all-then-write. Same order, strictly safer, and already covered by `purchasing-payables.e2e-spec.ts` cases 3 and 8 — but it is a touch of shipped Phase 4 code, taken deliberately rather than duplicating the invariant.
- (−) A transaction now holds every one of its raw-material locks for its whole duration rather than releasing them progressively (it never did release them early — Postgres holds row locks to commit — but the acquisition is earlier). This is the pessimistic cost DEBT-002 already tracks.

**Alternatives considered:**

- *Lock lazily, per sale line, as each product's recipe is walked*: rejected — the lock order becomes the client-controlled cart order, which is exactly the deadlock. It also re-locks a material shared by two products in the same cart, and can only ever report one shortfall when the cashier needs the whole list.
- *A single batched statement, `SELECT id FROM raw_materials WHERE id = ANY($1) ORDER BY id FOR UPDATE`*: rejected for v1 and logged as DEBT-008. It is one round trip instead of M, and the ordering is correct today because `LockRows` sits above `Sort` — but that is a query-plan dependency, and no test in this repo can pin a plan shape. A plan change would show up as an intermittent `40P01` in production against a green suite.
- *Optimistic concurrency (version column, retry)*: rejected — ADR-007 already rejected it for v1 and DEBT-002 tracks it as the future path with a measured trigger. It would also need retry orchestration around a transaction that creates a `LedgerEntry`, so a retried sale must be idempotent or it double-writes money.
- *Rely on ADR-007's lock without an ordering rule*: rejected — that is the status quo, and it is correct for balances and silently wrong for liveness.

---

## ADR-017: P&L reports a margin view and a cash view side by side; material cost is never subtracted twice

**Status:** Accepted

**Context:** PRD §5.4 specifies a profit & loss report as "income − COGS − expenses". Taken literally against this schema, that double-counts raw material cost, because the same cost enters the books twice by design:

- ADR-005 records material cost as `SaleItem.hppAtSale`, recognised **when the product is sold**.
- ADR-006 records the same material cost as a `LedgerEntry` OUTFLOW, recognised **when the money leaves** — either at purchase (`sourceType = PURCHASE`) or at settlement (`sourceType = PAYABLE_SETTLEMENT`).

Subtracting COGS *and* all outflow deducts a sack of coffee beans once in the month it was bought and again in the month it was sold. The error is not a rounding artefact: it is the entire material spend of the period, and it biases profit downward in a way that looks plausible enough never to be questioned.

A second, quieter problem forced the same decision. Under ADR-014 every central purchase's ledger entry is attributed to `Pusat (Dapur Sentral)`. A purely cash-based per-branch P&L therefore shows every outlet with revenue and almost no material cost, and the central kitchen with cost and no revenue — which makes per-branch profit meaningless.

**Decision:**

1. **The headline figure is the margin view:** `netProfit = totalIncome − cogs − operatingExpenses`.
   - `totalIncome` = INFLOW entries, split on the response into `salesRevenue` (`sourceType = SALE`) and `otherIncome` (everything else).
   - `cogs` = `ROUND(Σ (SaleItem.hppAtSale × SaleItem.quantity), 2)` over sales in the period — the ADR-005 snapshot, never live `Product` HPP.
   - `operatingExpenses` = OUTFLOW entries with **`sourceType = MANUAL` only**. Raw material purchases and payable settlements are deliberately excluded, because their cost is already inside `cogs` for whatever has been sold.
2. **The cash view is reported alongside it, never mixed into it:** `cash.totalInflow`, `cash.totalOutflow`, `cash.materialCashOutflow` (`PURCHASE` + `PAYABLE_SETTLEMENT`), and `cash.netCashFlow = totalIncome − totalOutflow`.
3. **Revenue is read from `ledger_entries`, not from `sales`**, so every income figure across all five Dashboard 3 reports comes from one table and ties by construction. `Σ Sale.totalAmount = salesRevenue` is asserted as a test invariant rather than assumed.
4. **Income by payment method is grouped from the same INFLOW rows**, so its total equals `totalIncome` by construction.

**Consequences:**

- (+) Each cost is subtracted exactly once *within each view*, and the two views are individually meaningful: `netCashFlow` ties to the bank and is what reconciliation matches; `netProfit` is what tells the owner whether the business makes money.
- (+) Per-branch profit becomes meaningful, because `cogs` is attributable to the branch that sold the item (`Sale.branchId`) while material cash outflow largely is not (ADR-014).
- (−) `netProfit` does not notice the difference between material bought and material consumed: buying a year of coffee in one month leaves it unmoved. `netCashFlow` shows it. Both figures are on the response for exactly this reason.
- (−) Filtering a report to `Pusat (Dapur Sentral)` returns outflow with zero revenue and a `null` margin. This is the correct picture of a central kitchen, and it is pinned by an e2e case so it is not "fixed" later.
- (−) A user reading only one of the two figures can still draw a wrong conclusion. Mitigated by labelling on the Phase 8g screen, not by collapsing the two into one number.

**Alternatives considered:**

- *Cash-only P&L (`netProfit = totalInflow − totalOutflow`, COGS as a memo line)*: rejected as the headline. It is trivially correct and ties perfectly to reconciliation, but it makes per-branch profit meaningless under ADR-014 and ignores PRD §5.4's explicit request for COGS. It survives as the `cash` block.
- *Subtract COGS and all outflow (the literal reading of PRD §5.4)*: rejected — this is the double-count the ADR exists to prevent.
- *Full accrual with inventory valuation (capitalise purchases, release as COGS)*: rejected — requires an inventory valuation model, and ADR-013 already rejected moving-average costing. There is no balance sheet in v1 and nothing asks for one.

---

## ADR-018: Report period boundaries and daily buckets are Asia/Jakarta; storage stays UTC

**Status:** Accepted

**Context:** Dashboard 3's five reports are filtered by date range, and one of them buckets income by day. Every timestamp in this repository is stored as a UTC instant in a `TIMESTAMP(3)` column without time zone and serialized with `toISOString()`. Nothing had ever needed to convert a stored instant into a *calendar day*, so the repo had no convention for it.

The business runs in WIB (UTC+7). Under UTC bucketing, the day boundary falls at **07:00 WIB** — inside opening hours for an F&B business — so every morning's first sales are attributed to the previous day. There is no worse place to put a day boundary than the middle of the first service hour.

The Phase 6 plan raised this same question for the Inventory Summary's month boundaries, leaned UTC for consistency with storage, and explicitly deferred the decision to Phase 7 with the instruction that it be answered once, globally. Phase 6 has not been implemented, so Phase 7 answers it first.

**Decision:**

1. **Report ranges are two INCLUSIVE `YYYY-MM-DD` calendar dates in `Asia/Jakarta`**, resolved server-side to a half-open UTC instant range: `from = startDate T00:00+07:00`, `to = (endDate + 1 day) T00:00+07:00`, exclusive.
2. **Daily buckets are WIB calendar days**, produced in SQL as `to_char(((entry_date AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')::date, 'YYYY-MM-DD')`. Both conversions are required: the column is naive-UTC, so a single conversion would interpret the stored value as already being WIB and shift it the wrong way by seven hours.
3. **Storage is unchanged.** `soldAt`, `entryDate`, `movementDate` remain UTC instants, serialized with `toISOString()`. Only report boundaries and buckets are WIB.
4. **The rule lives in exactly one file** — `apps/api/src/common/period.ts`, exporting `REPORT_TIMEZONE`, `resolveReportRange` and `eachWibDay`. It is in `common/`, not in the reports module, because Phase 6 must import it rather than defining a second month resolver.
5. **The timezone is a constant, not a parameter.** Not per-request (two users comparing screens would get different numbers with nothing on the page explaining why) and not an environment variable (a report's meaning must not depend on deployment config).
6. **A range is rejected with a 400** (`InvalidReportRangeException`) when the end precedes the start, a date is malformed or unreal, or the span exceeds 366 days. A future range is allowed and returns zeros.

**Consequences:**

- (+) "How much did we take on the 16th" means the WIB 16th, which is what the owner means.
- (+) WIB is a fixed UTC+7 offset with no DST, so there are no ambiguous or skipped local times and `dayCount` arithmetic is exact.
- (+) One definition for the whole repo: Dashboard 3 and Dashboard 5 cannot disagree at a boundary.
- (−) The daily-income bucket and the stored `entryDate` of the same row can name different calendar days (a 05:00 WIB sale is stored as the previous UTC day). Anyone reconciling a report row against a raw ledger row by eye must know this.
- (−) `docs/plannings/phase-6-inventory.md` decision 9 leaned UTC and must be corrected before Phase 6 is executed, or Dashboard 5 will contradict this ADR.
- (−) The 366-day cap makes a multi-year trend a client-side concern (several requests), not a single call.

**Alternatives considered:**

- *UTC boundaries everywhere, matching storage*: rejected — consistent with the database and wrong for the business, with the boundary landing inside opening hours. Consistency with a storage detail is not worth a daily report the owner cannot reconcile against their own till.
- *Timezone as a request parameter*: rejected — makes the same report mean different things to different callers with no indication on the page.
- *Timezone as an environment variable*: rejected — a report's semantics must not be a deployment concern.
- *Converting at the frontend*: rejected — the bucketing happens inside a SQL `GROUP BY`; the server would have to return raw rows for the client to re-aggregate, which defeats the aggregation.

## ADR-019: One `LedgerEntry` may legally be allocated against by more than one `BankTransaction` — accepted as a v1 risk, not enforced

**Status:** Accepted

**Context:** While planning the frontend Reconciliation screen (`docs/plannings/phase-8h-reconciliation.md` §1.6), a scope note assumed the backend prevents double-allocating the same `LedgerEntry` "per whatever uniqueness rule the backend enforces." Reading `AllocationService.create` and the migration SQL shows there is no such rule. The only uniqueness constraint on `Allocation` is `(bankTransactionId, idempotencyKey)` (ERD §6). `AllocationService.create` and `trg_check_allocation_sum` both cap the sum of `ACTIVE` allocations **per `BankTransaction`** — they never sum allocations per `ledgerEntryId`. So one `LedgerEntry` can legally receive allocations from several different `BankTransaction`s, and can legally be over-allocated relative to its own `amount`, with nothing server-side noticing.

This is a real gap: a ledger entry could be "settled" twice by two unrelated bank transactions, which is not the reconciliation invariant the module is meant to guarantee. It surfaced only now because the frontend screen is the first thing to expose a ledger-entry picker where an operator could actually trigger it.

**Decision:**

1. **This is accepted as a known v1 risk, not fixed.** No new migration, no new trigger, no schema change.
2. **The frontend adds an advisory-only signal**: the Reconciliation screen's split-allocation ledger-entry picker (`SplitAllocationDialog`) marks entries that already carry an `ACTIVE` allocation, but does not disable them — disabling would invent a rule the server does not have, and the server remains the single source of truth for what is actually allowed (Playbook §7).
3. **Revisit once real reconciliation volume exists.** If double-allocation of a ledger entry is observed in practice (or an operator reports being confused by it), the fix is a `trg_check_ledger_entry_allocation_sum` trigger mirroring `trg_check_allocation_sum`, added via a normal schema-change proposal (AGENTS.md governance gate).

**Consequences:**

- (+) No migration, no new trigger, no change to the two-layer enforcement pattern (`Decimal` check + `FOR UPDATE` trigger) that ADR-007 established for the invariant that *is* enforced.
- (+) The frontend does not lie about server behavior — it shows information, never a false guarantee.
- (−) A `LedgerEntry` can be double-settled by two different `BankTransaction`s with no server-side error. An operator relying on the advisory marker alone, or scripting around the API directly, can still do this.
- (−) The gap is silent: nothing logs or alerts when it happens. Detecting it today requires a manual query (`GROUP BY "ledgerEntryId" HAVING SUM(...) > entry.amount` over `ACTIVE` allocations).

**Alternatives considered:**

- *Add `trg_check_ledger_entry_allocation_sum` now, mirroring the existing trigger*: rejected for v1 — it's a migration for a gap with no observed incidence yet, and the existing trigger pattern (`FOR UPDATE` lock, `AFTER INSERT OR UPDATE OR DELETE`) needs to be re-derived correctly for the entry side rather than assumed identical (a `LedgerEntry` has no `sync_transaction_status`-equivalent status column to keep in sync). Worth doing the day it's actually needed, not speculatively.
- *Service-level `Decimal` check only, no trigger*: rejected — without a `FOR UPDATE` lock on the ledger entry, two concurrent allocation requests could each read a stale sum and both pass, recreating the exact race ADR-007 fixed for the bank-transaction side. A check that doesn't hold under concurrency is worse than an honestly-documented gap.
- *Block in the frontend by disabling already-allocated entries in the picker*: rejected — the frontend has no authority to invent a constraint the server doesn't enforce (Playbook §7); an operator using the API directly, or a future second screen, would bypass it entirely, and the UI would be asserting a guarantee that doesn't exist.

