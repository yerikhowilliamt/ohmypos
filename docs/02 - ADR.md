# OhMyPos — Architecture Decision Records

**Status:** Draft v3
**Depends on:** PRD v1.1, System Design v4, ERD v3

**Changelog (v2 → v3):** Added ADR-025, which turns OhMyPos into a multi-tenant system and adds a platform-operator identity. It partially supersedes ADR-011 — that ADR's rejection of a multi-tenant Business layer no longer holds, while everything else it decided does.

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

**Status:** Accepted. **Re-affirmed 2026-08-22** on measured volume (Phase 14 Workstream C, `DEBT-001`) — see below.

**Context:** Dashboard 3 and Dashboard 5 need aggregated, near-real-time figures (P&L, top products, inventory summary). Kasync's own reconciliation dashboard already uses query-time aggregation successfully at its transaction volume.

**Decision:** All OhMyPos reports are computed by querying `LedgerEntry`, `SaleItem`, and `StockMovement` directly at request time. No materialized views, snapshot tables, or scheduled aggregation jobs in v1.

**Consequences:**

- Simplest possible implementation, no cache-invalidation logic to maintain, reports are always exactly consistent with the underlying ledger/stock data.
- If report query latency becomes a problem once real data volume is known, this ADR should be revisited (materialized views or a dedicated read-model table) — tracked as a risk in System Design Section 11, not assumed to be permanent.

**Alternatives considered:**

- _Materialized views or a read-model table from the start_: rejected for v1 — premature optimization for a data volume that isn't yet known, and adds real implementation and consistency-maintenance cost.

**2026-08-22 re-affirmation (Phase 14 Workstream C):** The "if report query latency becomes a problem" condition above could finally be checked against measured data instead of guesswork. Two disposable volume tiers were seeded (`apps/api/prisma/seed-volume.ts`, 3 branches at realistic daily throughput): T1 (12 months, ~131K sales) and T2 (36 months, ~395K sales, ~986K `sale_items`, ~1.8M `stock_movements`). All five Dashboard-3 report endpoints, plus `cash-balance`, were measured at T2 over 20 warm HTTP requests each with `EXPLAIN (ANALYZE, BUFFERS)` on the underlying query. Applying System Design §11's literal trigger (any report >1s at a one-year range, or a Seq Scan on `sale_items`/`ledger_entries` at a one-month range): **no trigger fired for any of the six endpoints measured** — worst case was 720ms p95 (`daily-income` at one year), and every one-month query resolved via an index. This ADR's decision therefore **holds** at T2 volume, which is roughly 3x the business's actual current scale. Full measurement table and per-endpoint detail: `docs/08 - Tech_Debt_Log.md`, `DEBT-001`. `GET /inventory/summary` was measured separately (it has no comparable "range" dimension) and its own stricter p95 budget **did** fire at T2 — see `DEBT-013`, which stays Open with the new numbers; this does not affect the verdict above, since System Design §11's report trigger and DEBT-013's inventory-specific budget are different thresholds by design.

---

## ADR-009: Hand-written shared API contract types in `packages/api-contracts` (not code-generated, for now) — Superseded by ADR-010

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

**Status:** Accepted — **partially superseded by ADR-025** (only the "no multi-tenant Business layer" decision and its matching rejected alternative; the role model, `branchId` rule, JWT/`tokenValidFrom` pattern, and Owner-only user creation are unchanged)

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

**Status:** Accepted — **amended 2026-08-29 (TASK-120), see the Amendment section below.** The decision stands; how the row is identified and what it is called both changed.

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

**Amendment (2026-08-29, TASK-120) — the row is identified by a flag, and renamed:**

Two things in the original decision turned out to be wrong in practice.

1. **Point 2 said the service "resolves the branch ID for `Pusat (Dapur Sentral)`" — by name.** That made the row's NAME load-bearing, and nothing guarded it. Renaming the row broke no foreign key, so `PATCH /branches/:id` returned 200; only the *next* central purchase failed, with a 503 that named nothing and pointed at nothing. `Branch.isSystem` (migration `20260828201617_add_branch_system_and_main_store`, partial unique index `branches_single_system`) is now the lookup key. `resolveLedgerBranchId` uses `findFirst({ where: { isSystem: true } })`, and the two rejection sites compare `branch.isSystem` rather than the name. The row's label is now free data.

2. **The name itself was wrong.** "(+) Reflects real-world business operation: the central kitchen is an actual physical location (PRD §8.1)" does not hold for every business on this product — the Owner who raised it has no central kitchen at all. The row is a **scope** ("not tied to any one store"), not a place, and naming it like a flagship store made it read as one: it appeared in the Cabang list with Edit and Delete buttons while being absent from the POS branch picker, which is precisely how the confusion was reported. It is now **`Umum`**, and the corresponding UI control reads "Umum" rather than "Pusat".

Consequently the row is hidden from the Cabang page and from both cashier branch pickers (ERR-038), while remaining visible in reports — where its cost genuinely belongs (ADR-023). It is protected from rename and delete by `SystemBranchProtectedException`.

The last original consequence — "missing seed yields an explicit 500" — was true and worse than it read: the production bootstrap never created the row at all, so a real installation failed its first sale (ERR-037). `ensureSystemRefs` is now the single writer, shared by the bootstrap script and both seeds.

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

**Status:** Accepted. Extended by ADR-023 (2026-08-22) — inventory's month boundary now delegates to this ADR's `common/period.ts` instead of defining its own UTC boundary.

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

---

## ADR-020: Profile Photo Upload via Cloudinary (Reversing ERD §7 Note 4)

**Status:** Accepted (Supersedes ERD §7 Note 4)

**Context:**
`03 - ERD.md` §7 Note 4 initially excluded `User.photoUrl` and `POST /users/me/photo` to avoid bringing in third-party storage dependencies for non-essential features. During product scoping, user profile photo upload was explicitly requested for self-service profiles. Storing image binaries directly in Postgres or local disk in a containerized environment is anti-pattern and violates Playbook guidelines.

**Decision:**
1. **Add `User.photoUrl`**: Nullable string field on `User` model, holding remote HTTPS URL from Cloudinary.
2. **Dedicated Cloudinary Upload Service**: Add `ProfilePhotoService` isolated in `apps/api/src/modules/auth/profile-photo.service.ts` to keep `AuthService` core clean.
3. **Deterministic Public ID & Server-side Transformation**: Use deterministic public ID `ohmypos/users/<userId>` with `overwrite: true` to prevent image sprawl. Cloudinary performs square thumbnail face crop (`256x256`, `crop: 'thumb'`, `gravity: 'face'`) server-side, removing need for client-side image cropping libraries.
4. **Endpoint**: Expose `POST /auth/me/photo` with multipart file upload interceptor, validating mimetype (`image/jpeg`, `image/png`, `image/webp`) and 2MB max file size.

**Consequences:**
- (+) Simple user experience with zero frontend cropping overhead.
- (+) Zero orphaned image accumulation in Cloudinary (deterministic overwrite by user ID).
- (+) Database stores only lightweight URL string.
- (−) Introduces external dependency on `cloudinary` SDK in `apps/api`.
- (−) Requires Cloudinary environment variables (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`).

**Alternatives considered:**
- *Local filesystem / volume storage*: rejected — not resilient in containerized/stateless deployments, requires manual static file serving and backup strategy.
- *Store Base64/Binary in PostgreSQL (`bytea`)*: rejected — bloats database backups, hurts query cache, anti-pattern for transactional DBs.
- *Client-side direct upload via signed URLs*: rejected — adds unnecessary API complexity for low-volume avatar uploads in v1.

---

## ADR-021: Attendance Tracking, Branch Device Registry, and Leave Requests (Expanding Beyond PRD §3/§10 Non-Goals)

**Status:** Accepted (Expands PRD §3 & §10 Non-Goals)

**Context:**
PRD §3 and §10 originally established "Employee shift/payroll management" as an explicit non-goal. However, store operations require basic attendance monitoring (tracking when a cashier logs in and detecting whether the login occurred on an authorized store tablet or an unauthorized personal phone) and leave request management (allowing employees to submit leave requests and owners to approve/reject them).

**Decision:**
1. **Attendance & Device Registry (Phase 11):**
   - **Device Scoping:** `Device` is scoped to `Branch`, not `User` (a branch shares 1–3 physical tablets among assigned cashiers).
   - **Role Scoping:** Attendance tracking is strictly enforced for `KASIR` logins. `ADMIN` and `OWNER` are not branch-bound and are excluded from attendance tracking (`attendance: null`).
   - **Identification Mechanism:** A long-lived, HttpOnly, first-party signed cookie (`ohmypos_device = <deviceId>.<hmac>`) signed using Node's built-in `crypto` HMAC-SHA256. Activated physically by an authenticated `OWNER` at the terminal (`POST /devices/activate`).
   - **Login UX:** Login always succeeds for valid active accounts. Unregistered or mismatched devices record an `AttendanceRecord` with `isValid: false` and a `violationReason`, showing a non-blocking warning banner to the cashier rather than locking them out of the POS.
   - **Accepted Residual Risk (v1):** A cashier with dev tools access to a physical tablet could extract and copy the device cookie to a personal device. Accepted for v1 as low risk in typical retail operations.
2. **Leave Requests (Phase 12):**
   - Employees (`KASIR`) submit `LeaveRequest` records; approval/rejection authority is strictly `OWNER`-only (consistent with ADR-011 user governance).
   - Routed under `(shared)/leave-requests` so both roles can access their respective views without widening back-office RBAC.

**Consequences:**
- (+) Satisfies operational compliance without building full complex shift/payroll systems.
- (+) Zero new npm dependencies for device signing (Node native `crypto`).
- (+) POS logins are never blocked during store rush hours even if a terminal cookie is cleared.
- (−) Adds two tables (`devices`, `attendance_records`) and one enum (`AttendanceViolationReason`) in Phase 11.
- (−) Device cookie cloning via dev tools is possible; accepted as v1 trade-off.

**Alternatives considered:**
- *Browser Canvas/Hardware Fingerprinting*: rejected — fragile across browser/driver updates, causing false violations on legitimate tablets.
- *IP Subnet / User-Agent matching*: rejected as primary validator — personal phones on store Wi-Fi share the same public IP as the store tablet.
- *Public/Unauthenticated Device Activation Endpoint*: rejected — introduces brute-force risk; activation must be an authenticated Owner ceremony directly on the terminal browser.
- *Blocking Login on Invalid Device*: rejected — risking POS downtime during peak operational hours over an informational monitoring check.

---

## ADR-022: Bank statement import accepts PDF e-statements alongside CSV (Reversing PRD §10)

**Status:** Accepted (Reverses the PRD §10 non-goal "PDF bank statement parsing")

**Context:**
PRD §10 deferred PDF parsing because Kasync had deferred it. In practice the bank delivers mutasi rekening as a PDF e-statement, so every reconciliation cycle began with a manual PDF→CSV conversion — the exact friction reconciliation was meant to remove. The deferral was inherited, never justified on its own merits.

Scope is deliberately one bank: the Mandiri Livin e-statement. A second sample in `docs/e-statement/` is filed as "mutasi bca.pdf" but is in fact a **Bank Sultra** statement with an unrelated layout; it is not implemented and must not be keyed as `BCA`. *(Extended by ADR-026: a genuine BCA e-statement was obtained later and is now implemented as `BCA_PDF`. Everything else in this ADR stands.)*

**Decision:**
1. **PDF is added, CSV is untouched.** A new `POST /import/pdf/:accountId?format=…` sits beside the existing `POST /import/csv/:accountId`. One route per container so each validates its own file type and the CSV contract stays byte-for-byte identical.
2. **Format keys carry the container:** `MANDIRI_PDF` joins `BCA` and `MANDIRI`. The list moved into `packages/api-contracts` (`BankImportFormatSchema`, `BANK_IMPORT_FORMATS`) because the API switch and the web picker previously duplicated it and could drift (ADR-010).
3. **`pdf-parse@1.1.4`, with a custom `pagerender`.** Its default renderer is unusable: it concatenates runs on a line with **no separator** (`text += item.str`) and splits lines on **exact float equality** of the baseline. We supply our own renderer and consume positioned text runs.
4. **Parse by column geometry, not by line regex.** The statement is a fixed grid (`No` x=20, date/time x=52, description x=124, nominal and saldo right-aligned). Rows are grouped around the sequential `No` marker, each claiming the runs between the midpoints to its neighbours. Page furniture and the disclaimer page fall outside every row and need no blocklist.
5. **Direction comes from the sign on Nominal** (`+` → INFLOW, `-` → OUTFLOW); the saldo column is discarded. Amounts are Indonesian-formatted (`1.099.500,00`).
6. **`txnDate` stores the day only**, consistent with both CSV parsers and the matching engine. The clock time is folded into `dedupHash`, where it separates same-day rows.
7. **The row number is excluded from `dedupHash`.** It restarts at 1 in every statement, so including it would give the same transaction a different hash on an overlapping re-import and defeat `@@unique([accountId, dedupHash])` — a silent double-import.
8. **File type is detected by signature, never mimetype.** The multipart mimetype is client-supplied and routinely wrong; Nest's `FileTypeValidator` rejected legitimate CSV uploads in our own e2e suite. Both routes check the `%PDF-` magic bytes instead.
9. **Encrypted PDFs are rejected, not decrypted.** Mandiri ships e-statements password-protected and `pdf-parse` has no password support at all. The user removes the password before uploading; a locked file returns an actionable Indonesian message.

**Consequences:**
- (+) Statements import directly, removing the manual conversion step.
- (+) No `schema.prisma` change: PDF rows produce the same `ParsedTransaction`, and the existing unique constraints already make re-import idempotent.
- (+) Verified against the real 57-transaction statement: every row parsed, and the amounts reconcile exactly from the opening to the stated closing balance.
- (−) One new runtime dependency (`pdf-parse`), pinned to 1.1.4. v2 is ESM-only and pulls the native `@napi-rs/canvas`, both hostile to this CJS/Alpine build.
- (−) The parser is tuned to one issuer's layout; another bank needs a new parser, and a Mandiri redesign would break this one.
- (−) Password-protected files require a manual unlock step by the user.
- (−) No end-to-end test parses a real PDF: statements are personal financial records and cannot be committed, and a hand-generated PDF was not accepted by the bundled pdf.js. Parsing is covered by unit tests over extracted geometry; the HTTP route is covered by e2e error paths.

**Alternatives considered:**
- *Replace CSV entirely*: rejected — discards working, tested importers for no gain.
- *One endpoint sniffing the container from magic bytes*: rejected — `format` is still required to choose the bank, so it removes no parameter while coupling "which bank" to "which container".
- *`pdfjs-dist` / `unpdf`*: genuinely better on encrypted PDFs and error granularity, but v4+ `pdfjs-dist` is ESM-only and breaks under this repo's `module: commonjs`. Reconsider if password support becomes a requirement.
- *Lenient repair of malformed amounts*: rejected — malformed amounts came from a synthetic sample, not real output. Guessing a money value is worse than skipping the row, which surfaces as an unreconciled gap.
- *Regexing flattened page text*: rejected — description, date, time and amount interleave unpredictably once the grid is flattened.

## ADR-023: Calendar period boundaries are Asia/Jakarta everywhere, extending ADR-018 to Inventory

**Status:** Accepted

**Context:** `apps/api/src/common/period.ts` (ADR-018, backing every `/reports/*` endpoint) resolves a calendar month/range in **Asia/Jakarta (UTC+7)**. `apps/api/src/modules/inventory/period.ts` (backing `/inventory/summary` and `/inventory/opening-stock`, i.e. Dashboard 5) resolved the same kind of boundary in **UTC**. Each file's own header instructed the other to import from it; neither did, and Phase 6 (inventory) shipped before Phase 7 (reports) made its ADR-018 decision, so the contradiction was never reconciled.

`StockMovement.movementDate` and `LedgerEntry.entryDate` are both set from `Sale.soldAt`, so the seven-hour gap between the two definitions was directly observable: a sale in the last WIB hour of a month (e.g. `2026-08-01 00:30 WIB`, stored as `2026-07-31T17:30:00.000Z`) was placed in **August** by every report but in **July** by the Inventory Summary — the same sale's revenue and COGS in one month, its stock consumption in the previous one. Phase 14's `monthly-cycle.e2e-spec.ts` (Stage 8) reproduced this empirically against a real July cycle before this ADR was written: pre-fix, July's Kopi `outQuantity` read `0.1600` where the WIB-consistent figure is `0.1400`, and August's `inQuantity` read `0.0000` where a WIB-dated purchase should have appeared.

PRD §9's success criterion — "one full monthly cycle end-to-end without manual data correction" — cannot be met while two dashboards disagree about which month a sale belongs to.

**Decision:**

1. **`apps/api/src/modules/inventory/period.ts` delegates to `apps/api/src/common/period.ts`.** `parsePeriodMonth('2026-07')` computes the first and last calendar day of July, calls `resolveReportRange` (ADR-018) to get the WIB instant range, and returns that as `periodStart`/`periodEnd`. `common/period.ts` is now the **only** place a calendar-month or calendar-range boundary is computed in the repository.
2. **`OpeningStock.periodMonth` (a `@db.Date` column) is decoupled from the WIB instant.** A `@db.Date` column stores whatever calendar date the driver derives from the JS `Date` it receives; the WIB `periodStart` for July is `2026-06-30T17:00:00.000Z`, which truncates to `2026-06-30` — one day earlier than every row written under the pre-ADR-023 UTC boundary (`2026-07-01T00:00:00.000Z` → `2026-07-01`). Using `periodStart` directly for this column would silently orphan every existing `OpeningStock` row's unique key `(rawMaterialId, periodMonth)`, causing the next declaration for an existing period to be inserted as a duplicate instead of updating the original. `Period` therefore carries a second field, `periodMonthDate` (UTC midnight of the 1st, computed independently of the WIB shift), used **only** for `OpeningStock.periodMonth` reads and writes in `opening-stock.service.ts`. Every `StockMovement` range query (`movementDate`) and the `OPENING` movement's own `movementDate` continue to use the WIB `periodStart`/`periodEnd` — only the `@db.Date` column's value is decoupled.
3. **No data migration.** Verified empirically (not assumed): writing `periodMonthDate` for July 2026 stores `2026-07-01`, byte-identical to what the pre-ADR-023 code stored. Existing `OpeningStock` rows keep matching their unique key with no backfill.
4. **`apps/api/test/inventory.e2e-spec.ts`'s Case R and Case D-1 were updated**, not left as regressions: they encoded the old UTC boundary as "correct" (e.g. a `2026-05-31T23:59:59.999Z` sale counted in May's `outQuantity`). Under WIB that instant is `2026-06-01T06:59:59.999+07:00` — June, not May — so May's `outQuantity`/`closingQuantity` and June's `openingQuantity` shift accordingly (`10.0000`/`68.0000`/`68.0000` in place of `11.0000`/`67.0000`/`67.0000`), and the OPENING `StockMovement`'s `movementDate` is now `2026-04-30T17:00:00.000Z` (WIB May 1st midnight) rather than the UTC calendar date. The full e2e suite (13 suites / 247 tests) is green after the update.

**Consequences:**
- (+) Dashboard 3 (reports) and Dashboard 5 (inventory) agree on which month a sale belongs to, by construction — the exact defect this ADR closes.
- (+) One definition of a calendar-month/range boundary for the whole repository (`common/period.ts`), matching ADR-018's original intent.
- (+) No data migration required for `OpeningStock` (verified, §Decision 3).
- (−) `/inventory/summary` and `/inventory/opening-stock`'s numbers change for any period boundary within the last WIB day-vs-UTC-day of a month, for anyone comparing against a screenshot or exported report taken before this ADR.
- (−) `Period.periodMonthDate` is a second date field on the same interface as `periodStart`/`periodEnd`, carrying real risk of the wrong one being used at a future call site — mitigated by the type's own doc comment explaining exactly when each applies, and by `opening-stock.service.ts` being the only file that reads `periodMonthDate`.

**Alternatives considered:**
- *Reports adopt UTC, superseding ADR-018* (Phase 14 plan §3.1 Option 2): rejected — reverses a deliberate, documented decision for a business that operates entirely in WIB; a "daily income" report whose day starts at 07:00 local is wrong for the user.
- *Document the divergence, change nothing* (Phase 14 plan §3.1 Option 3): rejected — PRD §9's "no manual correction" criterion cannot be met while a single sale's COGS and stock-out disagree by construction.
- *Use `periodStart` directly for `OpeningStock.periodMonth` and accept the one-day drift*: rejected once the truncation behavior was measured — it does not just look different, it breaks the unique-key lookup for every pre-existing row, which is a correctness bug, not a cosmetic one.

---

## ADR-024: Purchases are entered in the supplier's pack unit at a total price; the latest purchase sets the live material cost; waste is a per-product HPP allowance

**Status:** Accepted

**Context:** Three defects in the same area were reported together by the business (see `docs/handoff/2026-08-28-pos-feedback-confirmed-requirements-phases-3-7.md`), and they cannot be fixed independently because they all read the same two columns.

1. **One `unit` for three different jobs.** `RawMaterial.unit` was simultaneously the purchase unit, the stock unit, and the recipe unit. The business buys ayam per *ekor* and cooks per *pcs*; buys minyak per *liter* and measures per *ml*. With one column, the user had to divide by hand on every nota — `Rp45.000 / 2 liter` typed in as `Rp22,50` against a quantity of `2000` — and the system stored no record of what was actually bought.
2. **`RawMaterial.unitCost` was never updated by a purchase** (DEBT-006). It was deliberately deferred pending a costing-method decision, so live HPP went stale the moment a supplier's price moved. The business has now chosen: **latest purchase price**, explicitly not a weighted average.
3. **No waste allowance.** The reference spreadsheet applies a per-product percentage to the recipe total; the schema had nowhere to put it.

A fourth issue surfaced during implementation and is not in the handoff: **a per-unit cost is not a 2-decimal amount.** `Rp10.000 ÷ 3.000 gram` is `3,333333/gram`. Stored as `Decimal(18,2)` it becomes `3,33`, and a 3.000-gram recipe then costs `Rp9.990` instead of `Rp10.000` — a permanent ~0,1% HPP understatement on every gram- and ml-scale material. The handoff's own two worked examples both happen to divide exactly (`22,50/ml`, `4.500/pcs`), which is why the problem is invisible from the requirements alone.

**Decision:**

1. **`RawMaterial` carries two units and a factor.** `unit` keeps its exact previous meaning and is now named as what it always was — the **STOCK/RECIPE base unit**, which `currentStock`, `lowStockThreshold`, `RecipeItem.quantityUsed`, `StockMovement.quantity`, and `OpeningStock.quantity` are all measured in. `purchaseUnit` and `conversionFactor` (`1 ekor = 10 pcs` → `10`) are new. Exactly **one** active purchase form per material; no package variants, no supplier-specific packaging, no general conversion graph.
2. **The purchase API takes what the nota says.** `SupplierPurchaseItemInputSchema` drops `quantity` and `unitCost` and takes `purchaseQuantity` (in the purchase unit) plus `lineTotal` (the TOTAL price for that quantity). The server derives `quantity = purchaseQuantity × conversionFactor` and `unitCost = lineTotal ÷ quantity`. A client-supplied unit cost would be the same money-correctness hole that `CreateSupplierPurchaseSchema`'s missing `totalAmount` field already closes.
3. **Each purchase line snapshots both sides.** `purchaseQuantity`, `purchaseUnit`, and `conversionFactor` record what was bought; `quantity`, `unitCost`, and `lineTotal` record what stock received and what was paid. Packaging may be edited freely afterwards — historical lines are frozen because they carry their own copy.
4. **The latest applicable purchase sets `RawMaterial.unitCost`,** inside the purchase transaction, while `applyInbound`'s `FOR UPDATE` (ADR-016) is held. "Latest" is recomputed **from table state** — `ORDER BY purchase_date DESC, created_at DESC, id DESC LIMIT 1` — not compared against the row being inserted. A backdated purchase therefore inserts, loses the ordering, and rewrites the cost to the value it already had: the outcome depends on `purchaseDate` ordering only, never on which concurrent request finishes last. This closes DEBT-006.
5. **The STOCK base unit is immutable once any `StockMovement` exists** (400 `RawMaterialUnitLockedException`). Changing it would silently re-scale `currentStock`, every recipe line, every `OpeningStock` row, and the append-only movement log. The escape hatch is a new material; `purchaseUnit`/`conversionFactor` remain editable, which is the packaging-change path the business actually needs.
6. **`Product.wastePercent` (`Decimal(5,2)`, 0–100) is an HPP allowance only.** `hpp = round2(Σ(quantityUsed × unitCost) × (1 + wastePercent/100))`, applied after the recipe sum and rounded **once**. It never increases physical stock deduction — `RecipeItem.quantityUsed` is what a sale consumes and this column does not touch it. It is edited on the product form, not the recipe editor: the recipe editor is a full-replace payload, and a cost parameter must not ride along with "save recipe". Default `0` keeps every existing product's HPP byte-identical.
7. **Per-unit COST columns widen to `Decimal(18,6)`** — `RawMaterial.unitCost`, `SupplierPurchaseItem.unitCost`, `StockMovement.unitCostAtMovement`, `OpeningStock.unitPrice` — carried by a new `UnitCostString` contract primitive. A unit cost is a **rate**, not an amount. Every value that reaches the ledger (`lineTotal`, `totalAmount`, `LedgerEntry.amount`, `sellPrice`, `SaleItem.hppAtSale`) stays `Decimal(18,2)`, and the UI still displays costs at 2dp.
8. **The migration is additive and value-preserving.** `purchase_unit := unit`, `conversion_factor := 1`, `purchase_quantity := quantity`, `waste_percent := 0`; widening a numeric scale in Postgres does not change a stored value. Every pre-existing row means exactly what it meant before.

**Consequences:**
- (+) The user enters the nota as written; the system does the division, and records both what was bought and what stock received.
- (+) Live HPP tracks the latest supplier price (DEBT-006 closed), deterministically under backdating and concurrency.
- (+) Historical `SupplierPurchaseItem`, `StockMovement`, and `SaleItem.hppAtSale` values are unaffected by packaging edits, later purchases, or waste changes (ADR-005 preserved).
- (+) The 6dp unit cost removes a systematic HPP understatement on gram/ml materials that nobody had noticed.
- (−) **Breaking API change.** `POST /supplier-purchases` no longer accepts `quantity`/`unitCost` per line. API and web must ship together; any external caller breaks.
- (−) `RawMaterial` now has two unit columns, and a reader who skips the doc comments could confuse them. Mitigated by explicit `///` comments, distinct UI labels ("Satuan Stok / Resep" vs "Satuan Beli"), and the base-unit lock.
- (−) One extra indexed query per material per purchase for the latest-cost lookup. Acceptable at v1 volume; it uses indexes that already exist.
- (−) Correcting a genuinely wrong base unit now requires creating a new material — see DEBT-062.

**Alternatives considered:**
- *A `RawMaterialPurchaseUnit` child table with an active row plus history*: rejected — it builds the schema for multiple simultaneous package variants, which the business explicitly declined for v1, and adds an "exactly one active row" invariant Postgres can only express with a partial unique index, plus a join on every raw-material read.
- *Convert in the frontend and leave the backend alone*: rejected — the server would trust a client-derived unit cost, the conversion would live nowhere (so it would be re-typed on every nota), and the purchase record would still not say what was bought. It also defers nothing, since the latest-cost write-back needs a server-side normalized cost regardless.
- *Weighted moving average / FIFO / batch costing*: rejected — the business explicitly chose the latest purchase price.
- *Compare the new purchase's date against a stored `lastPurchaseDate` column*: rejected — it needs a new column and is wrong the moment a purchase is deleted or a line edited. Recomputing the winner from table state is self-healing by construction.
- *Keep unit costs at `Decimal(18,2)`*: rejected once measured — see Context, item 4.
- *Store the normalized cost as a `(total, quantity)` pair and divide at HPP time*: exact, but it restructures every cost read (HPP calculator, sale snapshot, reports, inventory) to remove a rounding error that six decimals already reduces below one micro-rupiah per unit.
- *Allow the base unit to change via a conversion migration that re-scales every dependent quantity*: rejected for v1 — it mutates `StockMovement` rows, which are append-only by design (ERD §3). Recorded as DEBT-062.
- *Waste as a global percentage, or per recipe ingredient*: rejected — the reference spreadsheet applies it per product, after the recipe total.
- *Waste also increasing physical stock deduction*: rejected — the spreadsheet applies the percentage to cost only, and inflating consumption would make stock-outs disagree with the physical count.

---

## ADR-025: Multi-tenancy via a shared database with a `tenantId` discriminator, and a separate `PlatformAdmin` identity

**Status:** Accepted

**Supersedes:** ADR-011 in part — specifically its Decision that "no multi-tenant Business layer [is] needed" and its rejected alternative "Multi-tenant Business entity for future resale". ADR-011's role model (KASIR/ADMIN/OWNER), its `branchId` rule, its JWT + `tokenValidFrom` pattern, and its Owner-only user creation all stand unchanged.

**Context:** v1 is a single-business system, by explicit decision. PRD §3 lists "Multi-tenant SaaS" as a non-goal while asking that the schema "not actively block this later," and ADR-011 rejected a Business entity on the grounds that OhMyPos was confirmed single-business and that building for a hypothetical need would repeat Kasync's own late-multi-tenancy drift in reverse. That need is no longer hypothetical: v2 sells OhMyPos to other businesses, and adds an operator-facing dashboard for managing them.

Reading the code before deciding surfaced three facts that constrain the options:

1. **Multi-tenancy was not merely absent — it was deliberately removed during the Kasync port.** `apps/api/prisma/schema.prisma:140` still carries the note: `/// Kasync's unique is (userId, name); with multi-tenancy dropped it collapses to name.` ERD §7 records the same thing as a porting trap. Not one of the 23 models carries a tenant column today.
2. **Ten unique constraints are globally scoped** (`users.email`, `branches.name`, `categories.name`, `products.name`, `raw_materials.name`, `suppliers.name`, `devices.activation_code`, and three `idempotency_key` columns). Worse, `apps/api/src/common/system-refs.ts` resolves the central kitchen branch and the two system categories **by those globally unique names** — so a second tenant would not merely collide on insert, it would silently attach one tenant's ledger entries to another tenant's branch.
3. **An ORM-level filter cannot be the only defence.** There are ~17 `$queryRaw`/`$executeRaw` call sites — the whole of `reports.service.ts` is raw SQL — plus three PL/pgSQL triggers, none of which a Prisma client extension can see.

**Decision:**

1. **Shared database, shared schema, `tenantId` discriminator.** One `Tenant` row per business. Every one of the 23 business models gets a `tenantId TEXT NOT NULL` (matching the existing `id String @default(uuid())` convention — no column in this schema uses `@db.Uuid`) — including child tables (`SaleItem`, `RecipeItem`, `Allocation`, …) where it is redundant against the parent. The redundancy is the point: a uniform column is what lets the query filter be written as a single `$allModels` rule with no special cases, and special cases are where isolation bugs live.
2. **Tenant is resolved server-side, never supplied by the client.** `JwtAuthGuard` already reads the user row from the database on every request in order to trust the DB over the token for `role` and `branchId` (`jwt-auth.guard.ts:69`); `tenantId` is read in the same query and published to an `AsyncLocalStorage` context. No header, no subdomain, no path segment carries a tenant. There is therefore nothing for a client to spoof.
3. **Three layers of enforcement, not one.** (a) A Prisma client extension injects `tenantId` into every query and **throws** rather than passing through when the context is empty — fail closed. (b) Composite foreign keys at the database level (`(branch_id, tenant_id) → branches(id, tenant_id)`) make a cross-tenant reference physically impossible, which is the property Row-Level Security would otherwise have provided. (c) A two-tenant `tenant-isolation.e2e-spec.ts` suite asserts non-leakage across every list, detail, and report endpoint.
4. **No Postgres RLS.** The composite-FK layer buys most of RLS's guarantee without requiring `SET app.tenant_id` per connection, which would conflict with the `pg.Pool` driver-adapter setup in `prisma.service.ts` and complicate migrations and seeding. The residual gap — raw SQL — is closed by explicit `tenant_id` predicates plus the e2e suite, and is recorded as technical debt rather than pretended away.
5. **The super admin is not a `User`.** A separate `PlatformAdmin` table, separate JWT secrets, separate cookies, and a separate `PlatformAuthGuard`. `UserRole` gains no `SUPER_ADMIN` member. The consequence that justifies the extra table: `User.tenantId` can be `NOT NULL` with no exceptions, so "tenantId is null, therefore see everything" — the single most common multi-tenant leak — is not expressible in this schema.
6. **`users.email` stays globally unique**, by choice rather than by omission. Login then needs no tenant selector and `AuthService.login` keeps its `findUnique({ where: { email } })`. The price is that one person cannot be staff at two tenants under one email. `devices.activation_code` stays globally unique for a different reason: activation happens before any tenant context exists, and the lookup has only the code to go on. The other eight uniques become composite with `tenantId`.
7. **Tenants are provisioned by a platform admin only.** No self-registration, no approval workflow — the same stance ADR-011 §5 takes for users, one level up. Creating a tenant also seeds its central branch and two system categories in the same transaction, because `system-refs.ts` makes a tenant without them unable to record its first sale.
8. **Impersonation is read-only, logged, and short-lived.** A platform admin may mint a 30-minute tenant access token for that tenant's OWNER, with no refresh token and an `imp` claim that causes every non-`GET` request to be rejected. A reason string is required and every session is recorded in `impersonation_sessions`. Widening this to read-write is a separate decision, not an implementation detail.
9. **The three existing triggers are left untouched.** `check_allocation_sum`, `check_ledger_allocation_sum`, and `sync_transaction_status` operate on `id`, not on names or scope, so composite FKs guaranteeing single-tenant rows are sufficient to keep them correct. No new `BEFORE` trigger may be added to `allocations`: migration `20260823120100` documents that lock ordering depends on Postgres firing `BEFORE` triggers in alphabetical name order, and a new name sorting between the two existing ones reintroduces the deadlock they were written to avoid.

**Consequences:**

- (+) One deployment, one migration run, one connection pool serves every tenant — the operating cost stays close to v1's.
- (+) `User.tenantId NOT NULL` removes the nullable-tenant escape hatch entirely.
- (+) Cross-tenant foreign keys become a database error rather than a code-review responsibility.
- (+) Aggregate metrics across tenants are a plain `GROUP BY`, which a database-per-tenant design would have made genuinely hard.
- (−) **The raw-SQL reporting layer must be filtered by hand.** `reports.service.ts` is not covered by the client extension, and nothing but tests will catch a missed predicate. Recorded in `08 - Tech_Debt_Log.md`.
- (−) A `tenantId` column on child tables is denormalized and can, in principle, disagree with its parent. The composite FKs are what make that "in principle" only.
- (−) One email belongs to one tenant forever; a staff member moving between tenants needs a new address.
- (−) Platform controllers must be `@Public()` to bypass the global `JwtAuthGuard` before applying `PlatformAuthGuard` — an arrangement that fails open if the second guard is forgotten. Mitigated by an e2e suite that enumerates every `/platform/*` route and requires 401 without a platform token.
- (−) All 18 existing e2e suites need tenant setup, and `prisma/seed.ts` — which drives real services so that denormalized balances keep a single writer — changes with their signatures.

**Alternatives considered:**

- *Schema-per-tenant*: rejected — migrations would run N times, Prisma has no good story for dynamically selecting a schema per request, and the operator dashboard's cross-tenant aggregates would become N queries stitched in application code.
- *Database-per-tenant*: rejected — strongest isolation, but the infrastructure and operational cost is disproportionate to the current scale, and it makes exactly the aggregate reporting this v2 is meant to add the hardest thing to build.
- *Shared database with Postgres RLS*: seriously considered, and it is the textbook answer. Rejected for v2's first phase because `SET LOCAL app.tenant_id` must be issued per connection, which fights the `pg.Pool` configuration in `prisma.service.ts` and complicates the seed (which instantiates services directly) and the migration path. Composite FKs deliver the structural half of RLS's guarantee with none of that. **Revisit this** if the raw-SQL surface grows or if a tenant ever demands contractual isolation.
- *Adding `SUPER_ADMIN` to `UserRole`*: rejected — it is the smaller diff, but it forces `User.tenantId` to be nullable and forces the query extension to grow a "if null, do not filter" branch. That branch is the leak, and refusing to create it is worth an extra table.
- *Reusing `branchId` as the tenant key*: rejected outright — `branchId` is nullable on `SupplierPurchase`, `StockMovement`, and `User`, where `null` already means "central" (ADR-004, ADR-014). Overloading it would make "central" and "all tenants" the same value.
- *Merging `BusinessProfile` into `Tenant`*: rejected for this phase — conceptually tidier, but it would ripple through the business-profile module, its contracts, and its UI for no isolation benefit. `Tenant` holds what the operator owns (slug, status); `BusinessProfile` stays what the tenant edits about itself, with a `tenantId @unique`.
- *Subdomain-per-tenant routing*: rejected for now, not on merit — it needs wildcard DNS and TLS, and changes cookie-domain and CORS handling plus `apps/web/lib/api-proxy.ts`. Because tenant resolution is server-side (Decision 2), subdomains can be layered on later without touching the data model.
- *Plans, quotas, and billing in the same release*: rejected — deliberately out of scope. Shipping paid features on top of an isolation layer that has not yet proven itself in production inverts the risk order.

## ADR-026: BCA e-statement PDF import, and the geometry rules a second issuer forces

**Status:** Accepted (Extends ADR-022; does not supersede it — the Mandiri parser is unchanged)

**Context:**
ADR-022 added PDF import for exactly one issuer, Mandiri Livin, and recorded that the only BCA-labelled sample then on hand (`mutasi bca.pdf`) was really a Bank Sultra statement with an unrelated layout, so `BCA` stayed CSV-only. A genuine BCA "Laporan Mutasi Rekening" e-statement is now available — 7 pages, 63 transactions — and its layout is nothing like Mandiri's. Reusing `MandiriPdfParser` was not an option, and the differences are not cosmetic: two of them are data-integrity decisions, not formatting ones.

Three properties of the BCA grid drive everything below:
1. **No row-number column.** Mandiri's rows are keyed off a sequential `No` marker; BCA has none.
2. **Variable row height.** A BCA row is as tall as its detail text — one line for `BIAYA ADM`, five for a GoPay top-up — where Mandiri's rows sit on a fixed ~46pt pitch.
3. **No year on the row.** The date cell reads `13/08`. The year appears only in the page header, as `PERIODE : AGUSTUS 2026`.

**Decision:**
1. **A separate `BcaPdfParser`, keyed `BCA_PDF`.** Added to `BankImportFormatSchema`/`BANK_IMPORT_FORMATS` (ADR-010, ADR-022 Decision 2) and to `BankParserFactory`. No route, contract, or schema change: the existing `POST /import/pdf/:accountId` and `ParsedTransaction` already carry it. ADR-022's statement that BCA must not be keyed as PDF is superseded on that one point only.
2. **Rows are keyed off the `DD/MM` date cell, and a row runs to the *next* date marker — with no height cap.** The next marker is the true boundary; clamping short of it silently truncates a tall row's description. Only the last row on a page has no marker beneath it, and there a 60pt cap applies.
3. **The page's trailing furniture is matched explicitly, not merely out-capped.** The closing totals block (`SALDO AWAL`/`MUTASI CR`/`MUTASI DB`/`SALDO AKHIR`) right-aligns its amounts into the **CBG** column and its transaction counts into the **MUTASI** column. It sits ~68pt below the marker of a three-line last row but only ~44pt below a single-line one — and a fee or interest row at the foot of a statement is routinely single-line. A height cap alone would therefore let a last row inherit a junk branch code, or, on an amount-less row, an invented amount. The block's labels (in the detail column, x ≥ 190, which distinguishes them from a real `SALDO AWAL` row whose label sits in KETERANGAN at x ≈ 88.7) and the `Bersambung ke halaman berikut` footer form an explicit floor.
4. **Direction comes from a marker column, not from a sign.** BCA prints a bare `DB` at x ≈ 442 on outflows and nothing at all on inflows — the opposite of Mandiri's `+`/`-` prefix. A value in that column that is neither `DB` nor empty means the column was misread, so the row is dropped rather than defaulted to `INFLOW`.
5. **Money is US-formatted here.** `205,000.00` — the comma groups thousands and the dot divides. This is the exact inverse of Mandiri's `1.099.500,00`, and the two parsers must never share an amount regex.
6. **The year is derived from the `PERIODE` header, and a row the header cannot date is dropped.** A row whose month matches the period takes the period's year. The single exception is a December row on a January statement, which takes the previous year — BCA does carry the tail of the previous month across a year boundary. Any *other* month mismatch is dropped. A statement with no readable `PERIODE` header yields zero transactions rather than a guess.
7. **`dedupHash` excludes everything page-relative,** as in ADR-022 Decision 7. BCA prints no clock time, so the signature is date + description + amount + type, with a counter separating byte-identical rows. Nothing about page or row position enters it, so an overlapping re-import stays idempotent against `@@unique([accountId, dedupHash])`.
8. **Description joins KETERANGAN + detail + CBG.** The branch code is kept because it is the only thing distinguishing some same-day fee rows from each other.
9. **The real statement is not committed.** It carries a live account number, the holder's name, a phone number and counterparty names. `docs/e-statements/` is now default-deny for PDFs, with the synthetic samples allow-listed. `docs/e-statements/gen-bca-pdf.js` reproduces the measured geometry — variable row heights, the tight totals block, the letter-spaced legal notice that lands in the CBG and MUTASI columns — so the sample statements exercise the real traps without holding real data.

**Consequences:**
- (+) Verified against the real 7-page statement: all 63 transactions parsed, and the CR/DB totals (20 / 3,440,700.00 and 43 / 3,826,360.00) reconcile **exactly** with the statement's own summary block.
- (+) No schema, route, or frontend change. The format picker is data-driven off `BANK_IMPORT_FORMATS`, so `BCA (PDF e-Statement)` appears with no UI edit.
- (+) Building the sample generator against the measured geometry caught two live defects before release: the height cap truncating tall rows (Decision 2) and the totals block leaking into a short last row (Decision 3). Neither was reachable from the one real statement on hand, whose last row happens to be three lines tall.
- (−) A third issuer means a third parser. Two parsers now share only `pdf-text.util.ts`; the column geometry, the amount format, the direction rule and the date rule all differ. A common "PDF table" abstraction was considered and rejected below.
- (−) The parser is tuned to one layout. A BCA redesign breaks it, and the geometry must be re-derived against a real sample rather than adjusted by guess.
- (−) A row dated outside the statement period is dropped rather than imported. This surfaces as an unreconciled gap, which is the intended failure direction, but it is a silent one.

**Alternatives considered:**
- *Generalise `MandiriPdfParser` with a configurable column map*: rejected. The two issuers share the idea of a table and nothing else — marker column vs. date column, fixed vs. variable row height, sign vs. marker for direction, dot- vs. comma-grouping, year-on-row vs. year-in-header. A config object expressive enough to cover both is a worse artefact than two direct parsers, and it couples a working Mandiri importer to every future BCA change.
- *Rely on `MAX_ROW_HEIGHT` alone to exclude the totals block*: rejected — see Decision 3. It happens to work on the sample in hand and fails on a single-line last row, which is the more common shape.
- *Derive direction from the running SALDO delta instead of the `DB` marker*: rejected. It is self-validating where it works, but BCA prints the running balance only intermittently — most rows have an empty SALDO cell, so direction would be underivable for the majority of them.
- *Infer the year from the filename* (`3940774470_AGU_2026`): rejected — the filename is user-renameable and is not part of the document.
- *Import an out-of-period row under the period's year anyway*: rejected. It converts a visible gap into a transaction silently filed in the wrong month, which is the failure direction ADR-022 already chose against.
- *Flatten each line and regex it*: rejected for the same reason as ADR-022, and more strongly here — BCA's 4–5-line detail blocks and its `TANGGAL :10/08` continuation line both parse as separate transactions once the grid is flattened.
