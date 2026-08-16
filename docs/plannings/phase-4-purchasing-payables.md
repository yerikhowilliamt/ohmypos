# Phase 4 — Purchasing & Payables — Implementation Plan

**Status:** ⏸ Awaiting human approval. No code, no `schema.prisma` edit, no migration has been written.
**Date:** 2026-08-16
**Scope:** PRD §5.3 "Dashboard 2.2", raw-material side — `Supplier`, `SupplierPurchase`, `SupplierPurchaseItem`, `Payable`, `PayableSettlement`, `StockMovement` (inbound only)
**Depends on:** PRD v1.1 §5.3 §8, ADR-004, **ADR-006**, **ADR-007**, ADR-010, ADR-011, ADR-012, ADR-013, ERD v3 §3/§4/§6, System Design v4 §6.2/§6.3/§7, Playbook v3 §3–§10 §18, Task Log TASK-003/004/005
**Blocks:** Phase 5 (Sales — needs stock to decrement and `StockMovementsService` to decrement it), Phase 6 (Inventory), Phase 7 (Reporting)
**Governance:** AGENTS.md applies in full — no `schema.prisma` edit or migration without explicit approval, no dependency added, no Git write operations, strict scope.

---

## 0. How to read this document (for the implementer)

This plan is written so that a model or developer executing it has **no room left to guess**. It is
structured exactly like `phase-3-master-data.md`, which produced TASK-005:

- **§1–§8 record decisions** — what is being built and why, with the alternatives that were
  rejected. Read these to understand; do not re-open them.
- **§9 is the executable spec** — literal signatures, literal SQL, literal file lists, literal
  error mappings, and the traps that pass tests while being wrong. When §9 and your instinct
  disagree, §9 wins.
- **§10 is the definition of done** — a greppable checklist. Do not report the phase complete
  until every box holds.

Two rules that override anything you might infer from elsewhere in the repo:

1. **If this document does not say to create a file, do not create it.** The file list in §6 is
   exhaustive.
2. **If this document does not say to edit an existing file, do not edit it.** The list of
   existing files that get touched is in §6.3 and is also exhaustive. AGENTS.md forbids
   unrelated refactoring, and there are two known inconsistencies in the repo (§6.5) that this
   phase deliberately does not fix.

---

## 1. Decisions requiring your confirmation before any code

Six decisions in this plan are not mechanical transcription of the ERD. Each has a
recommendation. The fastest path is to reply "all as recommended"; anything you change, change
here and the rest of the plan follows.

| # | Decision | Options | Recommended | Where |
|---|---|---|---|---|
| 1 | How `Payable.remainingBalance` is modelled | Derived / **Stored under lock** / DB view / DB trigger | **Option B** — stored column, written only inside the settlement transaction under `SELECT … FOR UPDATE` | §2 |
| 2 | Which branch a **central** purchase's `LedgerEntry` is attributed to (`LedgerEntry.branchId` is NOT NULL; `SupplierPurchase.branchId` is nullable) | Make ledger `branchId` nullable / caller supplies one / **seeded central branch** | **Option L3** — seed a `Pusat (Dapur Sentral)` branch, resolved by unique name. Needs **ADR-014**. | §3 |
| 3 | What `SupplierPurchase.paymentStatus` means over time | Immutable-at-creation / **live, maintained by settlement** | **Option P2** — creation accepts only `PAID`\|`UNPAID`; the settlement transaction moves it to `PARTIALLY_PAID` then `PAID` | §4 |
| 4 | Does a purchase update `RawMaterial.unitCost`? | Yes (last cost) / moving average / **No** | **No** — out of scope for Phase 4; logged as DEBT-006 | §5 |
| 5 | Who may create a `PayableSettlement`? | Any authenticated / `OWNER`+`ADMIN` / **`OWNER` only** | **`OWNER` only** — money leaving the central account, and System Design §5 gives neither `KASIR` nor `ADMIN` that frontend route | §7 |
| 6 | Schema additions in §8 | — | ⚠️ **Explicit "go" required** before `schema.prisma` is touched or `prisma migrate dev` is run (AGENTS.md) | §8 |

Decision 2 is the one that is genuinely load-bearing and is **not** answered by any existing
document — see §3 for why the ERD leaves a hole here.

---

## 2. Options for modelling the payable balance

The question: given `Payable.originalAmount` and N `PayableSettlement` rows, how does the system
know what is still owed, and how is over-settlement prevented under concurrency?

### Option A — Derived on every read: `remaining = originalAmount − sum(settlements)`

No `remainingBalance` column at all. Every read aggregates `payable_settlements`.

- **Pro:** one source of truth by construction. The balance cannot disagree with its settlement
  history because it *is* its settlement history. No denormalization to keep in sync.
- **Pro:** trivially correct after a manual `DELETE` of a bad settlement row.
- **Con:** **it does not solve the correctness problem, only the reporting one.** Two concurrent
  settlements each read `remaining = 100`, each insert `80`, and the payable is over-settled by
  60 with no error raised — the classic check-then-act race. Closing it still requires a
  `FOR UPDATE` lock on *something*, and with no `payables` row to lock you would have to lock the
  whole settlement set, which Postgres will not do for rows that do not exist yet.
- **Con:** **contradicts ERD §3**, which declares `remainingBalance` and `status` as columns.
  Dropping them is a schema decision needing its own approval, not a simplification.
- **Con:** every payable list screen becomes a `GROUP BY` join. Minor, but it is DEBT-001's shape
  applied to a table that did not need it.

### Option B — Stored `remainingBalance` + `status`, written only inside the settlement transaction under `SELECT … FOR UPDATE` ✅ **recommended**

The columns the ERD already specifies. The settlement flow locks the `payables` row first, reads
the current balance from the locked row, validates, then writes the settlement, the new balance,
the new status, and the ledger entry — all in one transaction.

- **Pro:** **it is the same mechanism ADR-007 already mandates for `RawMaterial.currentStock`**,
  and the same one Kasync's `trg_check_allocation_sum` uses for the allocation-sum invariant
  (`allocation.service.ts:46`). One concurrency pattern in the codebase, not two. System Design §7
  already describes exactly this shape for stock: "the source of truth is the log, but the balance
  is kept as a fast-read column."
- **Pro:** the lock is what makes over-settlement *impossible* rather than merely *usually
  detected* — the second transaction blocks until the first commits, then re-reads the decremented
  balance and is correctly rejected.
- **Pro:** matches ERD §3 exactly, so no schema deviation to justify.
- **Pro:** `GET /payables` and the per-supplier utang summary (PRD §5.3, "running payable balance
  per supplier") are a plain `SUM(remaining_balance) GROUP BY supplier_id` — no join to
  settlements.
- **Con:** the column can in principle drift from the settlement rows if anything ever writes it
  outside the settlement transaction. Mitigated the same way stock is: **exactly one code path
  writes it** (§9.6), stated in the file header, and asserted by an e2e test that re-derives the
  balance from the settlement rows and compares.
- **Con:** requires the row lock to be genuinely present. This is the single easiest thing in the
  phase to omit — §9.6 makes it literal and §10 greps for it.

### Option C — Postgres view or generated column

A `payable_balances` view, or `remaining_balance` as a `GENERATED ALWAYS AS` column.

- **Pro:** always correct like Option A, and computed in the database.
- **Con:** a Postgres generated column **cannot reference another table**, so this can only be a
  view — which means `Payable.status` has nowhere to live either, and ERD §3's three-state enum
  becomes a `CASE` expression in SQL.
- **Con:** Prisma views need `previewFeatures = ["views"]` plus hand-written migration SQL and are
  not introspected cleanly (the same objection that rejected Option C for HPP in Phase 3 §2).
  Toolchain weight for a query that is not slow.
- **Con:** **still does not close the race.** A view is a read construct; concurrent writers are
  unaffected by it.

### Option D — Stored column + a PL/pgSQL trigger enforcing `sum(settlements) <= originalAmount`

Option B, plus a `trg_check_payable_settlement_sum` trigger modelled literally on Kasync's
`trg_check_allocation_sum` (`prisma/migrations/20260814191153_init/migration.sql`).

- **Pro:** defence in depth, and it is the repo's own established precedent for a sum-constrained
  child table. `allocation.service.ts`'s header explicitly says enforcing twice "is not a
  simplification" to remove.
- **Pro:** protects against a future second write path (a bulk import, a data fix) that forgets
  the lock.
- **Con:** the allocation trigger exists because Kasync had **multiple** allocation-creation paths
  and an idempotency replay path. `PayableSettlement` has exactly one writer in v1, inside one
  service method. The trigger would guard a door with no second entrance.
- **Con:** ERR-001 is the standing warning here: PL/pgSQL `RAISE EXCEPTION` surfaces through
  Prisma 7 as `P2039` with the real error nested at `meta.driverAdapterError.cause`, and it only
  produces a 400 instead of a 500 because `PostgresTriggerExceptionFilter` unwraps it. A second
  trigger inherits that whole fragility for a second time.
- **Con:** raw SQL in a migration is the least reviewable artifact in the repo.

**Recommendation: Option B.** It is what ERD §3 already specifies, it reuses the one concurrency
pattern the codebase already has (ADR-007's `FOR UPDATE`, applied to `payables` instead of
`raw_materials`), and it needs no new SQL. **Option D is the right upgrade path, not a v1
requirement** — log it as tech debt (DEBT-007) with the trigger condition "a second write path to
`payable_settlements` is added," so the decision is recorded rather than forgotten.

---

## 3. The hole in the ERD: a central purchase's `LedgerEntry` has no branch

This is the one place where two accepted documents cannot both be satisfied as written, and it
must be settled before any code, because both flows in §9 depend on the answer.

- `SupplierPurchase.branchId` is **nullable** — `null` means "central purchase" (ERD §3, ADR-004,
  PRD §8.4, and the "Central Purchase" glossary entry in AGENTS.md).
- `LedgerEntry.branchId` is **required** — inherited from Kasync unchanged, confirmed by ADR-012
  and implemented as `branchId String @map("branch_id")` in `schema.prisma:138`.

A central purchase paid immediately (`paymentStatus = PAID`) must therefore create a
`LedgerEntry` with a `branchId` it does not have. Same for the settlement of a payable that came
from a central purchase. Neither document resolves this.

### Option L1 — Make `LedgerEntry.branchId` nullable

- **Pro:** semantically honest — a central purchase genuinely belongs to no branch.
- **Con:** it changes a **ported table's baseline**, which ADR-012 §1 fixes as Kasync's literal
  schema. That is an amendment to an accepted ADR, not an implementation detail.
- **Con:** it silently changes `BranchScopeGuard`'s meaning on `/ledger-entries`: a `KASIR`
  filtering by branch would stop seeing null-branch rows (correct), but every Dashboard 3 report
  that groups by branch would now need a null bucket that ADR-008's query-time aggregation does
  not currently have.
- **Con:** it is a nullable-column migration on a table that will hold every financial record in
  the system — cheap now, expensive later.

### Option L2 — The API requires the caller to name a ledger branch for central purchases

`POST /supplier-purchases` would take `branchId: null` plus a separate `ledgerBranchId`.

- **Con:** two branch fields on one request is a guaranteed source of confusion, and it pushes an
  internal accounting detail onto every client. Rejected.

### Option L3 — Seed a system `Pusat (Dapur Sentral)` branch and attribute central ledger entries to it ✅ **recommended**

`SupplierPurchase.branchId` stays `null` — that remains the canonical, ADR-004-sanctioned marker
for "central". Only the generated `LedgerEntry` is attributed to a seeded branch row named
`Pusat (Dapur Sentral)`, resolved at write time by its unique name.

- **Pro:** **no ported table changes**, so ADR-012 stands untouched.
- **Pro:** every `LedgerEntry` keeps a branch, so reconciliation keeps working exactly as
  System Design §6.5 describes — a central purchase paid from the shared account is still an
  allocatable, attributable row. That is the entire point of ADR-004's split-allocation story.
- **Pro:** the central kitchen is a **real place** in this business (PRD §8.1: "centralized at a
  central kitchen"). Giving it a `Branch` row is modelling reality, not inventing a sentinel.
- **Con:** two representations of "central" now exist (`SupplierPurchase.branchId = null` and
  `LedgerEntry.branchId = <Pusat>`). Mitigated by stating the rule once, loudly: **`branchId = null`
  is the only way to record a central purchase; `Pusat` is never sent by a client and exists only
  because `LedgerEntry.branchId` is NOT NULL.** §9.4 puts that sentence in the code.
- **Con:** the branch must exist before any central purchase can be recorded, so the seed becomes
  load-bearing for a second reason (it already is, for the OWNER and the system categories).
  Handled with a pointed error message (§9.4).

**Recommendation: L3, and write ADR-014 to record it.** It meets Playbook §17's trigger criteria
on two counts — it affects more than one module (`SupplierPurchase`, `Payable`, `LedgerEntry`,
and every branch-grouped report), and it is hard to reverse once ledger history exists. ADR-014
does not supersede anything; it fills a gap ERD v3 left open.

---

## 4. Sub-decision: what `SupplierPurchase.paymentStatus` means over time

ERD §3 gives it three values (`PAID`, `UNPAID`, `PARTIALLY_PAID`) but never says when
`PARTIALLY_PAID` is written. ADR-006 makes creation binary: paid → ledger entry, unpaid →
payable, **never both** (ERD §6 states the mutual exclusion explicitly). So `PARTIALLY_PAID`
cannot be a creation-time value.

- **P1 — immutable at creation.** `paymentStatus` records what happened when the goods arrived and
  never changes; `Payable.status` is the live truth. *Con:* `PARTIALLY_PAID` becomes an
  unreachable enum value, i.e. the schema lies. Every purchase list screen must join `payables` to
  answer "is this paid?".
- **P2 — live, maintained by the settlement transaction** ✅ **recommended.** Creation accepts only
  `PAID` or `UNPAID` (narrowed in Zod, §9.2). The settlement transaction moves the parent purchase
  to `PARTIALLY_PAID` on a partial settlement and to `PAID` when the payable reaches zero — in the
  same transaction, one line after the `Payable` update. *Con:* a second denormalized field to
  keep in step. Accepted because it is written in the same single transaction as the field it
  mirrors, by the same one code path, and §10 greps that no other code writes it.

A fully settled purchase therefore reads `paymentStatus = PAID` with `ledgerEntryId = null` — that
is correct and intentional: the purchase *is* paid, and the expense lives on the settlement's
ledger entries, not on the purchase. **Do not "fix" this by back-filling `ledgerEntryId`**;
`SupplierPurchase.ledgerEntryId` means "the entry created at purchase time because it was paid
up front", and nothing else (ERD §3).

---

## 5. Sub-decision: a purchase does **not** update `RawMaterial.unitCost`

A purchase records `unitCost` per line, and `StockMovement.unitCostAtMovement` snapshots it for
historical costing (ERD §3). It is tempting to also write that price back to
`RawMaterial.unitCost` so the "current cost" reflects the latest purchase.

**Do not.** `RawMaterial.unitCost` feeds live HPP for every product (ADR-005, ADR-013), so writing
to it from the purchase flow silently changes every product's margin on every Dashboard 3 report
the moment a supplier's price moves — that is a **costing-method decision**, and both candidate
methods (last-cost and moving-average) are rejected: ADR-013 §2 rejects moving average by name,
and last-cost has no ADR at all.

Phase 4 leaves `unitCost` as master data, edited explicitly through `PATCH /raw-materials/:id`.
Log as **DEBT-006** with trigger condition "the owner reports that HPP is stale relative to actual
purchase prices", and proposed resolution "decide the costing method explicitly in an ADR
superseding/extending ADR-005."

Write this as a comment at the exact line in `supplier-purchases.service.ts` where a reader would
expect the write to be, so its absence reads as a decision (Playbook precedent: §9.1a of the
Phase 3 plan).

---

## 6. Module / file list, module wiring, and guard placement

### 6.1 New files — exhaustive

```
packages/api-contracts/src/
  supplier.schema.ts             CreateSupplierSchema, UpdateSupplierSchema, SupplierResponseSchema
  supplier-purchase.schema.ts    CreateSupplierPurchaseSchema, SupplierPurchaseQuerySchema,
                                 SupplierPurchaseItemResponseSchema, SupplierPurchaseResponseSchema
  payable.schema.ts              CreatePayableSettlementSchema, PayableQuerySchema,
                                 PayableResponseSchema, PayableSettlementResponseSchema,
                                 PayableSupplierSummarySchema
  stock-movement.schema.ts       StockMovementResponseSchema  (response shape only — no write
                                 endpoint exists in Phase 4, §6.4)

apps/api/src/common/
  system-refs.ts                 CENTRAL_BRANCH_NAME, PURCHASE_CATEGORY_NAME,
                                 resolveLedgerBranchId(tx, purchaseBranchId),
                                 resolvePurchaseCategoryId(tx)   — plain functions, not providers

apps/api/src/modules/suppliers/
  suppliers.controller.ts        RoleGuard: writes OWNER+ADMIN, reads any authenticated
  suppliers.service.ts           CRUD + private toResponse()
  suppliers.module.ts
  suppliers.dto.ts               createZodDto wrappers only
  suppliers.exceptions.ts        SupplierNameTakenException, SupplierInUseException

apps/api/src/modules/stock-movements/
  stock-movements.service.ts     applyInbound(tx, …) — the ONLY writer of RawMaterial.currentStock
  stock-movements.module.ts      exports StockMovementsService. No controller in Phase 4 (§6.4).

apps/api/src/modules/supplier-purchases/
  supplier-purchases.controller.ts   BranchScopeGuard + RoleGuard (§6.6)
  supplier-purchases.service.ts      the ADR-006 branch lives here, and only here (§9.4)
  supplier-purchases.module.ts       imports StockMovementsModule, LedgerEntriesModule
  supplier-purchases.dto.ts
  supplier-purchases.exceptions.ts   PurchaseItemMaterialNotFoundException
  supplier-purchases.mapper.ts       the only place a purchase response is shaped
  purchase-totals.ts                 ← pure calculator, no Prisma, no Nest (§9.3)
  purchase-totals.spec.ts

apps/api/src/modules/payables/
  payables.controller.ts         RoleGuard (§6.6)
  payables.service.ts            settle() — the FOR UPDATE + ledger flow (§9.6)
  payables.module.ts             imports LedgerEntriesModule
  payables.dto.ts
  payables.exceptions.ts         PayableAlreadySettledException, SettlementExceedsPayableException
  payables.mapper.ts
  payables.rules.ts              ← pure guard function, no Prisma, no Nest (§9.3)
  payables.rules.spec.ts

apps/api/test/
  purchasing-payables.e2e-spec.ts
```

### 6.2 Files that already exist and are **edited** — exhaustive

| File | Edit | Why |
|---|---|---|
| `apps/api/prisma/schema.prisma` | add 4 enums + 6 models + back-relation fields on `Account`, `Branch`, `LedgerEntry`, `RawMaterial` | §8 — ⚠️ approval gate |
| `packages/api-contracts/src/enums.ts` | add `PaymentStatus`, `PurchasePaymentStatusInput`, `PayableStatus`, `StockDirection`, `StockReferenceType` | ADR-010 — enums mirror the schema |
| `packages/api-contracts/src/index.ts` | 4 new `export *` lines | the package's only export surface |
| `apps/api/src/modules/ledger-entries/ledger-entries.service.ts` | **add one method**, `createSystemEntry(tx, input)` (§9.5). Change nothing else in the file. | Playbook §3 — a new module must not write another module's table directly |
| `apps/api/src/app.module.ts` | register `SuppliersModule`, `StockMovementsModule`, `SupplierPurchasesModule`, `PayablesModule` | wiring |
| `apps/api/prisma/seed.ts` | add the `Pusat (Dapur Sentral)` branch, 2 suppliers, 1 PAID purchase, 1 UNPAID purchase + 1 partial settlement | §9.9 — hand-checkable fixtures |

Nothing else. In particular: **do not touch** `raw-materials.service.ts`, `branch-scope.guard.ts`,
`role.guard.ts`, or any Phase 1/2/3 controller.

### 6.3 Module wiring — one direction only, no `forwardRef`

```
SuppliersModule            (standalone)
StockMovementsModule       exports StockMovementsService
LedgerEntriesModule        already exports LedgerEntriesService (verified: ledger-entries.module.ts:8)

SupplierPurchasesModule    imports [StockMovementsModule, LedgerEntriesModule]
PayablesModule             imports [LedgerEntriesModule]
```

`PayablesModule` does **not** import `SupplierPurchasesModule` even though the settlement flow
updates `SupplierPurchase.paymentStatus` (§4). That single-field update is a same-aggregate write
inside the settlement transaction, permitted by the rule in §6.5. Importing the purchases module
here would create the cycle that makes people reach for `forwardRef`. **`forwardRef` must not
appear anywhere in this phase**; if you find yourself wanting it, the wiring is wrong.

### 6.4 Why `StockMovement` has no controller in Phase 4

The prompt's scope is the **inbound** movement created by a purchase. Outbound (`SALE`) is
Phase 5, `OPENING` is Phase 6, and `ADJUSTMENT` has no requirement in any document. A read
endpoint (`GET /stock-movements`) belongs to Dashboard 5 in Phase 6, which is where the filter and
pagination requirements are actually specified.

So `StockMovementsService` is a **transaction-participant service with no HTTP surface**:
`stock-movements.module.ts` declares no `controllers`. Write one line in the module file saying
this is deliberate, so a later reader does not "complete" it.

### 6.5 The cross-module data rule this phase follows

Playbook §3 forbids reaching into another module's Prisma model. Applied literally that would
force a service wrapper around every foreign-key existence check, which the repo does not do —
`ledger-entries.service.ts:129-155` `findUnique`s `account`, `category` and `branch` directly.
The line this phase draws, stated once so it is not re-litigated per call site:

> **Reads of another module's table are permitted** (existence checks, resolving a system row).
> **Writes to another module's table go through that module's tx-aware service** —
> `LedgerEntry` via `LedgerEntriesService.createSystemEntry`, `RawMaterial.currentStock` via
> `StockMovementsService.applyInbound`.

One sanctioned exception, named here so it is not mistaken for a violation: the settlement
transaction writes `SupplierPurchase.paymentStatus` directly (§4). It is a status mirror of the
`Payable` the settlement owns, written in the same transaction; routing it through a service
would create the module cycle described in §6.3.

> **Observation, out of scope, no action taken:** `AccountsController`, `CategoriesController` and
> `BranchesController` still carry no `RoleGuard` — the same finding the Phase 3 plan §6 recorded
> and deliberately did not fix. It is still not fixed here. If it is ever fixed, it needs its own
> task, because it changes existing endpoints' behaviour.

### 6.6 Guard placement — explicit, per Playbook §8

| Endpoint | Guards | Roles | Branch scope |
|---|---|---|---|
| `POST /suppliers` | `RoleGuard` | `OWNER`, `ADMIN` | — (`Supplier` has no `branchId`) |
| `PATCH /suppliers/:id` | `RoleGuard` | `OWNER`, `ADMIN` | — |
| `DELETE /suppliers/:id` | `RoleGuard` | `OWNER`, `ADMIN` | — |
| `GET /suppliers`, `GET /suppliers/:id` | global `JwtAuthGuard` only | any authenticated | — (`KASIR` picks a supplier when recording a branch purchase) |
| `POST /supplier-purchases` | `BranchScopeGuard` | any authenticated | `@BranchScoped('body.branchId')` |
| `GET /supplier-purchases` | `BranchScopeGuard` | any authenticated | `@BranchScoped('query.branchId')` |
| `GET /supplier-purchases/:id` | `RoleGuard` | `OWNER`, `ADMIN` | see the note below |
| `GET /payables`, `GET /payables/:id` | `RoleGuard` | `OWNER`, `ADMIN` | — (`Payable` has no `branchId`) |
| `GET /payables/summary` | `RoleGuard` | `OWNER`, `ADMIN` | — |
| `POST /payables/:id/settlements` | `RoleGuard` | **`OWNER`** (decision 5) | — |

Two placements need their reasoning recorded in the code, because both look like mistakes:

**(a) `GET /supplier-purchases/:id` is role-restricted, not branch-scoped.** `BranchScopeGuard`
can only compare a branch id it can find on the request, and a detail route carries only the
purchase id — `@BranchScoped('params.id')` would compare a *purchase* id against a *branch* id and
reject everything. Rather than teach the guard to load the row (a guard change, out of scope, and
ERR-002's lesson is that guards which do more than deny have silent failure modes), the detail
route is `OWNER`/`ADMIN` only. `KASIR` lists its own branch's purchases through `GET
/supplier-purchases?branchId=<own>`, which returns the full item detail (§9.8) and therefore loses
nothing. Note this in the controller as a decision.

**(b) The central-purchase case — the point the prompt asks to be made explicit.**
`BranchScopeGuard` (`branch-scope.guard.ts:52-81`) already handles `branchId = null` correctly
without any change, and the behaviour is a *design outcome*, not an accident:

- `ADMIN` / `OWNER` → the guard returns `true` at line 54 before it ever looks at the body. A
  central purchase (`branchId: null`) is therefore **created only by `ADMIN` or `OWNER`**.
- `KASIR` → the guard reaches the fail-closed check at line 73. `null` is one of the three values
  it rejects, so a `KASIR` sending `branchId: null` gets **403, not a central purchase**.

This is exactly the confirmed policy in PRD §8.4: raw materials and packaging are bought
**centrally**, while incidental branch purchases (gas, refill water) are recorded by branch staff.
A cashier has no authority to record a central purchase, and the guard enforces that with no
special case. **Write that paragraph, condensed, as a comment on the `POST` handler** — otherwise
the absence of a `branchId: null` special case reads as the oversight TASK-004's handoff warned
about.

One consequence to be aware of when writing tests: **NestJS runs guards before pipes**, so
`BranchScopeGuard` sees the raw, unvalidated body. A `KASIR` who *omits* `branchId` gets **403 from
the guard**, not 400 from Zod. Assert 403 there, not 400.

---

## 7. Zod contracts — `packages/api-contracts`

Decimal discipline per Playbook §5, using the existing primitives (`primitives.ts`): money →
`MoneyString` (18,2), quantity → `QuantityString` (18,4). **No `z.number()` for money or
quantity anywhere. No `any` (AGENTS.md §8).**

### 7.1 New enums in `enums.ts`

```ts
/** OhMyPos — SupplierPurchase.paymentStatus (ERD §3). */
export const PaymentStatus = z.enum(['PAID', 'UNPAID', 'PARTIALLY_PAID']);
export type PaymentStatus = z.infer<typeof PaymentStatus>;

/**
 * The subset a client may send when CREATING a purchase. `PARTIALLY_PAID` is
 * unreachable at creation: ADR-006 makes the branch binary (ledger entry XOR
 * payable), and ERD §6 states the two are mutually exclusive at creation time.
 * The settlement flow is what widens the stored value to PARTIALLY_PAID (§4).
 */
export const PurchasePaymentStatusInput = z.enum(['PAID', 'UNPAID']);
export type PurchasePaymentStatusInput = z.infer<typeof PurchasePaymentStatusInput>;

export const PayableStatus = z.enum(['OPEN', 'PARTIALLY_SETTLED', 'SETTLED']);
export type PayableStatus = z.infer<typeof PayableStatus>;

export const StockDirection = z.enum(['IN', 'OUT']);
export type StockDirection = z.infer<typeof StockDirection>;

export const StockReferenceType = z.enum(['SALE', 'PURCHASE', 'OPENING', 'ADJUSTMENT']);
export type StockReferenceType = z.infer<typeof StockReferenceType>;
```

### 7.2 `supplier-purchase.schema.ts` — the create schema, written out

This is the schema most likely to be written loosely, so it is literal. Three rules are encoded
here rather than in the service, on purpose:

```ts
export const SupplierPurchaseItemInputSchema = z.object({
  rawMaterialId: UuidString,
  // Strictly positive: a zero-quantity purchase line is meaningless and would
  // write a no-op StockMovement (mirrors RecipeItemInputSchema's rule).
  quantity: QuantityString.refine((v) => Number(v) > 0, 'must be greater than zero'),
  unitCost: MoneyString,
});

export const CreateSupplierPurchaseSchema = z
  .object({
    supplierId: UuidString,
    /**
     * REQUIRED KEY, explicitly nullable. `null` means central purchase (ADR-004,
     * ERD §3) and is the only way to record one. Not `.optional()`: "central"
     * must be typed deliberately, never arrived at by forgetting the field.
     * BranchScopeGuard rejects null for KASIR before this schema ever runs (§6.6).
     */
    branchId: UuidString.nullable(),
    purchaseDate: DateTimeString,
    paymentStatus: PurchasePaymentStatusInput,
    /** The account the money left, when paymentStatus = PAID. Forbidden otherwise. */
    accountId: UuidString.optional(),
    note: z.string().trim().max(500).optional(),
    items: z.array(SupplierPurchaseItemInputSchema).min(1),
    // NOTE: there is deliberately no `totalAmount` field. The server computes it
    // from the items (§9.3) — a client-supplied total is a money-correctness hole.
  })
  .superRefine((dto, ctx) => {
    // ADR-006, encoded at the edge: PAID needs an account to debit; UNPAID must
    // not name one, because no money moves until settlement.
    if (dto.paymentStatus === 'PAID' && !dto.accountId) {
      ctx.addIssue({ code: 'custom', path: ['accountId'],
        message: 'accountId is required when paymentStatus is PAID' });
    }
    if (dto.paymentStatus === 'UNPAID' && dto.accountId) {
      ctx.addIssue({ code: 'custom', path: ['accountId'],
        message: 'accountId must be omitted when paymentStatus is UNPAID — no money moves until settlement (ADR-006)' });
    }
    // One line per raw material, so the FOR UPDATE lock set and the stock
    // increment are unambiguous (mirrors ReplaceRecipeSchema's superRefine).
    const seen = new Set<string>();
    dto.items.forEach((item, index) => {
      if (seen.has(item.rawMaterialId)) {
        ctx.addIssue({ code: 'custom', path: ['items', index, 'rawMaterialId'],
          message: 'duplicate rawMaterialId in the same purchase' });
      }
      seen.add(item.rawMaterialId);
    });
  });
```

`z.object` strips unknown keys, so a client that sends `totalAmount` anyway has it discarded
rather than honoured — assert that in e2e (§9.10 case 12).

### 7.3 `payable.schema.ts` — the settlement create schema

```ts
export const CreatePayableSettlementSchema = z.object({
  accountId: UuidString,             // the account the payment came from (ERD §3)
  amount: MoneyString.refine((v) => Number(v) > 0, 'must be greater than zero'),
  settledAt: DateTimeString,
  note: z.string().trim().max(500).optional(),
});
```

`payableId` comes from the route (`POST /payables/:id/settlements`), not the body — one id, one
place, so they cannot disagree.

### 7.4 Response schemas — fields and their primitives

| Schema | Fields |
|---|---|
| `SupplierResponseSchema` | `id`, `name`, `contact: z.string().nullable()`, `createdAt`, `updatedAt` |
| `SupplierPurchaseItemResponseSchema` | `id`, `rawMaterialId`, `rawMaterialName`, `unit`, `quantity: QuantityString`, `unitCost: MoneyString`, `lineTotal: MoneyString` |
| `SupplierPurchaseResponseSchema` | `id`, `supplierId`, `supplierName`, `branchId: UuidString.nullable()`, `isCentral: z.boolean()`, `purchaseDate`, `paymentStatus: PaymentStatus`, `totalAmount: MoneyString`, `ledgerEntryId: UuidString.nullable()`, `payableId: UuidString.nullable()`, `items: z.array(SupplierPurchaseItemResponseSchema)`, `note`, `createdAt`, `updatedAt` |
| `PayableResponseSchema` | `id`, `supplierPurchaseId`, `supplierId`, `supplierName`, `originalAmount: MoneyString`, `remainingBalance: MoneyString`, `settledAmount: MoneyString`, `status: PayableStatus`, `settlements: z.array(PayableSettlementResponseSchema)`, `createdAt`, `updatedAt` |
| `PayableSettlementResponseSchema` | `id`, `payableId`, `accountId`, `ledgerEntryId`, `amount: MoneyString`, `settledAt`, `createdAt` |
| `PayableSupplierSummarySchema` | `supplierId`, `supplierName`, `openPayableCount: z.number().int()`, `totalOutstanding: MoneyString` — PRD §5.3's "running payable balance per supplier" |
| `StockMovementResponseSchema` | `id`, `rawMaterialId`, `branchId: nullable`, `direction: StockDirection`, `quantity: QuantityString`, `referenceType: StockReferenceType`, `referenceId: nullable`, `unitCostAtMovement: MoneyString`, `movementDate`, `createdAt` |

`isCentral` is `branchId === null`, denormalized into the response so no client re-derives the
ADR-004 rule (and so the UI cannot get it backwards).

---

## 8. Proposed Prisma schema additions — ⚠️ approval gate, not applied

Migration name: `add_purchasing_payables_stock_movements`.

### 8.1 New enums

```prisma
/// OhMyPos — ERD §3. PARTIALLY_PAID is never a creation-time value (ADR-006);
/// the settlement flow writes it (plan §4).
enum PaymentStatus {
  PAID
  UNPAID
  PARTIALLY_PAID
}

/// OhMyPos — ERD §3.
enum PayableStatus {
  OPEN
  PARTIALLY_SETTLED
  SETTLED
}

/// OhMyPos — ERD §3.
enum StockDirection {
  IN
  OUT
}

/// OhMyPos — ERD §3. Only PURCHASE is written in Phase 4; SALE arrives in
/// Phase 5, OPENING in Phase 6. ADJUSTMENT has no writer yet, deliberately.
enum StockReferenceType {
  SALE
  PURCHASE
  OPENING
  ADJUSTMENT
}
```

### 8.2 New models

```prisma
/// OhMyPos — ERD §3.
model Supplier {
  id String @id @default(uuid())

  name String @unique
  /// Free text — phone, WhatsApp, or a person's name. Not validated as a phone
  /// number: Indonesian supplier contacts are not reliably one format.
  contact String?

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  purchases SupplierPurchase[]
  payables  Payable[]

  @@map("suppliers")
}

/// OhMyPos — ERD §3, System Design §6.2.
///
/// `branchId = null` means CENTRAL PURCHASE (ADR-004, PRD §8.4) — the canonical
/// and only marker for it. `ledgerEntryId` is set at creation only when the
/// purchase was PAID up front; an unpaid purchase gets a `Payable` instead and
/// never a ledger entry (ADR-006). The two are mutually exclusive at creation
/// time (ERD §6).
model SupplierPurchase {
  id String @id @default(uuid())

  supplierId String  @map("supplier_id")
  branchId   String? @map("branch_id")

  totalAmount   Decimal       @map("total_amount") @db.Decimal(18, 2)
  purchaseDate  DateTime      @map("purchase_date")
  paymentStatus PaymentStatus @map("payment_status")

  /// Set at creation iff paymentStatus = PAID. Stays null forever otherwise —
  /// a settled payable's expense lives on the settlements' entries, not here.
  ledgerEntryId String? @unique @map("ledger_entry_id")

  note String?

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  // Restrict everywhere: a purchase is financial history and must not vanish
  // because a supplier or branch row was deleted.
  supplier    Supplier     @relation(fields: [supplierId], references: [id], onDelete: Restrict)
  branch      Branch?      @relation(fields: [branchId], references: [id], onDelete: Restrict)
  ledgerEntry LedgerEntry? @relation(fields: [ledgerEntryId], references: [id], onDelete: Restrict)

  // Cascade: a purchase line has no meaning without its purchase (same rule as
  // RecipeItem → Product).
  items   SupplierPurchaseItem[]
  payable Payable?

  @@index([supplierId])
  @@index([branchId])
  @@index([purchaseDate])
  /// Dashboard 2.2 lists purchases by branch and date; KASIR always filters by branch.
  @@index([branchId, purchaseDate])
  @@map("supplier_purchases")
}

/// OhMyPos — ERD §3. `lineTotal` is a STORED column, so it is rounded per line
/// to 2dp and `SupplierPurchase.totalAmount` is the sum of those rounded values
/// (plan §9.3). This is deliberately different from HPP's round-once rule.
model SupplierPurchaseItem {
  id String @id @default(uuid())

  supplierPurchaseId String @map("supplier_purchase_id")
  rawMaterialId      String @map("raw_material_id")

  quantity  Decimal @db.Decimal(18, 4)
  unitCost  Decimal @map("unit_cost") @db.Decimal(18, 2)
  lineTotal Decimal @map("line_total") @db.Decimal(18, 2)

  createdAt DateTime @default(now()) @map("created_at")

  supplierPurchase SupplierPurchase @relation(fields: [supplierPurchaseId], references: [id], onDelete: Cascade)
  rawMaterial      RawMaterial      @relation(fields: [rawMaterialId], references: [id], onDelete: Restrict)

  /// One line per material per purchase — makes the FOR UPDATE lock set and the
  /// stock increment unambiguous. Also enforced in Zod (§7.2).
  @@unique([supplierPurchaseId, rawMaterialId])
  @@index([supplierPurchaseId])
  @@index([rawMaterialId])
  @@map("supplier_purchase_items")
}

/// OhMyPos — ERD §3, ADR-006. Utang to a supplier for an unpaid purchase.
///
/// `remainingBalance` is a denormalized running balance in the same sense as
/// RawMaterial.currentStock (System Design §7): the settlement rows are the
/// source of truth, this column is the fast-read balance. It is written by
/// exactly ONE code path — PayablesService.settle — inside a transaction that
/// holds a FOR UPDATE lock on this row (plan §2 Option B, §9.6).
model Payable {
  id String @id @default(uuid())

  /// Unique: one payable per unpaid purchase (ERD §3), never a rolled-up
  /// per-supplier balance. The per-supplier figure PRD §5.3 asks for is a SUM
  /// over these rows (GET /payables/summary).
  supplierPurchaseId String @unique @map("supplier_purchase_id")
  supplierId         String @map("supplier_id")

  originalAmount   Decimal       @map("original_amount") @db.Decimal(18, 2)
  remainingBalance Decimal       @map("remaining_balance") @db.Decimal(18, 2)
  status           PayableStatus @default(OPEN)

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  supplierPurchase SupplierPurchase    @relation(fields: [supplierPurchaseId], references: [id], onDelete: Restrict)
  supplier         Supplier            @relation(fields: [supplierId], references: [id], onDelete: Restrict)
  settlements      PayableSettlement[]

  @@index([supplierId])
  @@index([status])
  @@map("payables")
}

/// OhMyPos — ERD §3, ADR-006. The moment money actually leaves the account, and
/// therefore the only moment an unpaid purchase produces a LedgerEntry.
model PayableSettlement {
  id String @id @default(uuid())

  payableId String @map("payable_id")
  accountId String @map("account_id")
  /// Required and unique: every settlement generates exactly one expense entry.
  /// Unlike SupplierPurchase.ledgerEntryId this is NOT nullable — a settlement
  /// with no ledger entry would be money moving with no record of it.
  ledgerEntryId String @unique @map("ledger_entry_id")

  amount    Decimal  @db.Decimal(18, 2)
  settledAt DateTime @map("settled_at")
  note      String?

  /// Append-only, like Allocation — a settlement is corrected by recording
  /// another movement, never by editing history.
  createdAt DateTime @default(now()) @map("created_at")

  payable     Payable     @relation(fields: [payableId], references: [id], onDelete: Restrict)
  account     Account     @relation(fields: [accountId], references: [id], onDelete: Restrict)
  ledgerEntry LedgerEntry @relation(fields: [ledgerEntryId], references: [id], onDelete: Restrict)

  @@index([payableId])
  @@index([settledAt])
  @@map("payable_settlements")
}

/// OhMyPos — ERD §3, System Design §7. The append-only log that justifies every
/// change to RawMaterial.currentStock. Written only inside the transaction that
/// changes the balance, under FOR UPDATE (ADR-007).
model StockMovement {
  id String @id @default(uuid())

  rawMaterialId String  @map("raw_material_id")
  /// Attribution only — which branch triggered it. Null for central events
  /// (a central purchase, an OPENING). Never a partitioning key (ADR-004).
  branchId String? @map("branch_id")

  direction StockDirection
  quantity  Decimal        @db.Decimal(18, 4)

  referenceType StockReferenceType @map("reference_type")
  /// Points at the SupplierPurchase / Sale / OpeningStock that caused this.
  /// Deliberately NOT a foreign key: it is polymorphic across three tables,
  /// exactly like LedgerEntry.sourceId (ERD §2).
  referenceId String? @map("reference_id")

  unitCostAtMovement Decimal  @map("unit_cost_at_movement") @db.Decimal(18, 2)
  movementDate       DateTime @map("movement_date")

  /// Append-only — no updatedAt (ERD §3).
  createdAt DateTime @default(now()) @map("created_at")

  rawMaterial RawMaterial @relation(fields: [rawMaterialId], references: [id], onDelete: Restrict)
  branch      Branch?     @relation(fields: [branchId], references: [id], onDelete: Restrict)

  /// Drives Dashboard 5's inventory summary (ERD §6).
  @@index([rawMaterialId, movementDate])
  @@index([referenceType, referenceId])
  @@index([branchId])
  @@map("stock_movements")
}
```

### 8.3 Back-relation fields added to existing models

Prisma requires the other side of each relation. Add **only** these lines; change nothing else in
the existing models:

```prisma
model Account {
  // …existing…
  payableSettlements PayableSettlement[]
}

model Branch {
  // …existing…
  supplierPurchases SupplierPurchase[]
  stockMovements    StockMovement[]
}

model LedgerEntry {
  // …existing…
  /// Both optional 1-1 back-relations. A given entry is generated by at most one
  /// of these; `sourceType` says which (ERD §2).
  supplierPurchase  SupplierPurchase?
  payableSettlement PayableSettlement?
}

model RawMaterial {
  // …existing…
  purchaseItems  SupplierPurchaseItem[]
  stockMovements StockMovement[]
}
```

### 8.4 Points above that are decisions, not transcription

**(a) `Supplier.name @unique`** — the ERD does not specify it. `Category`, `Branch`, `Product` and
`RawMaterial` all have it, and two "Toko Sumber Rejeki" rows would split one supplier's utang
across two balances, breaking PRD §5.3's per-supplier figure.

**(b) `SupplierPurchase.note` and `PayableSettlement.note`** — not in the ERD. Added because the
business records these on paper today and the cost is one nullable column each. Say no if you
would rather stay strictly to the ERD.

**(c) `SupplierPurchaseItem` has `createdAt` but no `updatedAt`; `StockMovement` and
`PayableSettlement` likewise.** The ERD gives `SupplierPurchaseItem` no timestamps at all and
`StockMovement` only `createdAt`. These rows are append-only records of a past event; an
`updatedAt` would imply they can be edited.

**(d) `onDelete: Restrict` on every relation except `SupplierPurchase → SupplierPurchaseItem`
(Cascade).** Deleting a supplier, branch, account, raw material or ledger entry must never silently
delete financial history — it must fail loudly and be surfaced as a domain exception (§9.7). Line
items cascade because a line has no meaning without its purchase, matching `RecipeItem → Product`.

**(e) `StockMovement.referenceId` is not a foreign key.** It is polymorphic across
`supplier_purchases`, `sales` and `opening_stocks`, exactly like `LedgerEntry.sourceId`. A
composite index on `(referenceType, referenceId)` gives the lookup without a constraint that
cannot be expressed.

**(f) `PayableSettlement.ledgerEntryId` is required, while `SupplierPurchase.ledgerEntryId` is
nullable.** That asymmetry *is* ADR-006 expressed in the schema: a settlement always moves money;
a purchase only sometimes does.

### 8.5 Migration procedure (after approval)

```bash
pnpm --filter api prisma migrate dev --name add_purchasing_payables_stock_movements
pnpm --filter api db:seed
```

Pre-flight, because TASK-005's §9.0 found a drifted dev database that `prisma migrate status`
reported as green:

```bash
pnpm --filter api exec prisma migrate diff \
  --from-schema prisma/schema.prisma --to-config-datasource --script
```

> **Corrected 2026-08-16.** This block originally used the Prisma 5/6 flag names
> (`--from-schema-datamodel` / `--to-schema-datasource`), which Prisma 7 rejects
> outright — it exits 1 with a usage dump, which is easy to mistake for "the check
> ran and found nothing". The form above is the Prisma 7 one and prints
> `-- This is an empty migration.` when there is no drift.

Before the schema edit this must print **no changes**. If it prints DDL, the database is ahead of
or behind the schema and must be reset (`prisma migrate reset --force` then `db:seed`) *before*
the new models are added. **Do not use `prisma migrate status` for this check** — it compares
filenames, not structure, and reads green on a drifted database.

---

## 9. Executable spec (for the implementer)

### 9.1 Non-negotiables

Carried forward from the Phase 3 plan §9.1, unchanged, plus two new ones:

- **Never `.toNumber()` or `Number(...)` on a value that reaches a response.** Money and quantity
  cross the boundary as strings (Playbook §5).
- **Never `z.number()` for money or quantity.**
- **Never call `Decimal.set(...)`** — it mutates global rounding config and would change
  `MatchingEngine`'s arithmetic. Round explicitly with
  `.toDecimalPlaces(scale, Prisma.Decimal.ROUND_HALF_UP)`.
- **No `any`**, per AGENTS.md §8.
- Import `Decimal` as `Prisma.Decimal` from `../../generated/prisma/client` (the module
  `accounts.service.ts` and `raw-materials.service.ts` use), **never** `import Decimal from
  'decimal.js'` — two `Decimal` classes must never be mixed. (`allocation.service.ts` imports the
  bare one; that is ported code, not a pattern to copy.)
- **NEW — every money/quantity field in a response is serialized with an explicit
  `.toFixed(scale)`.** Verified in TASK-005: `new Prisma.Decimal('4530.00').toJSON()` returns
  `"4530"`, not `"4530.00"`. Implicit serialization loses scale.
- **NEW — inside a `$transaction(async (tx) => …)` callback, every database call uses `tx`.** A
  `this.prisma.x` there runs on a separate connection, outside the transaction. It typechecks, it
  passes the happy path, and it destroys the atomicity Playbook §7 requires.

### 9.1a Comment convention — this is what makes the code look like Phase 0–2

Code can satisfy every rule here and still not belong in this repo, because Phase 0–2 carries a
specific texture: **every non-obvious decision is commented with its source.** Read these three
files and match their density before writing anything:
`apps/api/src/common/guards/branch-scope.guard.ts`,
`apps/api/src/modules/raw-materials/raw-materials.service.ts`,
`apps/api/src/modules/allocation/allocation.service.ts`.

1. **Every file opens with a doc comment** naming what it is and citing the rule that governs it —
   `(ADR-006)`, `(ADR-007)`, `(Playbook §7)`, `(ERD §3)`.
2. **Comments explain *why*, never *what*.** `// Lock in id order — two concurrent purchases
   touching the same two materials in opposite order would deadlock` is right; `// lock the row`
   is noise.
3. **A deliberate omission is commented as deliberate.** The absent `unitCost` write-back (§5), the
   absent `StockMovement` controller (§6.4), the absent settlement trigger (§2 Option D), the
   absent `BranchScopeGuard` on `/payables` — each gets one line saying it is a decision.
4. **Cite the trap where the trap is.** The `tx`-not-`this.prisma` warning, the `.toFixed()` scale
   rule, and the ADR-006 branch all belong as comments at those exact lines in shipped code — this
   document is not in the repo, the code is.

A file whose only comments are the ones copied from this document has not met this rule.

### 9.2 The one-paragraph summary of ADR-006, to be pasted at the top of `supplier-purchases.service.ts`

> Stock always moves; money sometimes does. A purchase increments `RawMaterial.currentStock`
> unconditionally, because the goods have physically arrived. It creates a `LedgerEntry`
> **only if `paymentStatus = PAID`** at creation; if unpaid, it creates a `Payable` instead and the
> `LedgerEntry` is created later, by `PayablesService.settle`, for exactly the amount settled
> (ADR-006). Getting this backwards makes an expense appear before the money left the account and
> makes reconciliation match against numbers that never hit the bank.

### 9.3 `purchase-totals.ts` — pure calculator, literal signature

```ts
/**
 * Pure — no Prisma calls, no Nest DI (same shape as products/hpp.calculator.ts).
 *
 * Rounding rule, and why it DIFFERS from calculateHpp: `lineTotal` is a STORED
 * Decimal(18,2) column, so each line must be rounded to 2dp before it is
 * persisted, and `totalAmount` must equal the sum of the values actually stored.
 * calculateHpp rounds once at the end because nothing intermediate is stored
 * there. Do not "harmonise" these two rules — they are answering different
 * questions. (ADR-005 vs. ERD §3.)
 */
import { Prisma } from '../../generated/prisma/client';

export interface PurchaseLineInput {
  quantity: Prisma.Decimal;
  unitCost: Prisma.Decimal;
}

export interface PurchaseLineTotal {
  lineTotal: Prisma.Decimal;
}

export function calculateLineTotal(line: PurchaseLineInput): Prisma.Decimal {
  return line.quantity
    .times(line.unitCost)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/** Sum of the ALREADY-ROUNDED line totals — see the rounding note above. */
export function calculatePurchaseTotal(lineTotals: Prisma.Decimal[]): Prisma.Decimal {
  return lineTotals
    .reduce((sum, lt) => sum.plus(lt), new Prisma.Decimal(0))
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}
```

### 9.4 Flow 1 — `SupplierPurchase` creation: one transaction, one branch

**Transaction boundary (Playbook §7, System Design §6.2).** Everything below is inside a single
`this.prisma.$transaction(async (tx) => { … })`. Nothing before it writes; nothing after it
writes.

```
POST /supplier-purchases
  │
  ├─ [OUTSIDE tx] BranchScopeGuard  ──► KASIR: body.branchId must equal own branch,
  │                                     null/omitted ⇒ 403 (no central purchase for KASIR)
  │                                     ADMIN/OWNER: pass through, null allowed  (§6.6b)
  ├─ [OUTSIDE tx] ZodValidationPipe ──► CreateSupplierPurchaseSchema  (§7.2)
  │
  └─ $transaction ───────────────────────────────────────────────────────────────────┐
      │                                                                              │
      │ 1. supplier = tx.supplier.findUnique(supplierId)          → 404 if missing    │
      │ 2. if (branchId !== null) tx.branch.findUnique(branchId)  → 404 if missing    │
      │ 3. if (PAID) tx.account.findUnique(accountId)             → 404 if missing    │
      │ 4. materials = tx.rawMaterial.findMany({ id: { in: ids } })                   │
      │       set-compare against payload ids                                        │
      │       → PurchaseItemMaterialNotFoundException(missingIds) if short            │
      │ 5. lineTotals  = items.map(calculateLineTotal)          ← pure, §9.3          │
      │    totalAmount = calculatePurchaseTotal(lineTotals)     ← NEVER from client   │
      │                                                                              │
      │ 6. purchase = tx.supplierPurchase.create({ …, totalAmount,                    │
      │                 paymentStatus: dto.paymentStatus, ledgerEntryId: null })      │
      │ 7. tx.supplierPurchaseItem.createMany({ … lineTotal per row … })              │
      │                                                                              │
      │ 8. STOCK — always, regardless of payment status (ADR-006):                    │
      │    stockMovements.applyInbound(tx, {                                          │
      │      branchId: purchase.branchId,           // null for central               │
      │      referenceType: 'PURCHASE',                                               │
      │      referenceId: purchase.id,                                                │
      │      movementDate: purchase.purchaseDate,                                     │
      │      lines: items,                                                            │
      │    })                                                                         │
      │    └─ per material, in ASCENDING id order (§9.5):                             │
      │         SELECT id FROM raw_materials WHERE id = $1 FOR UPDATE   (ADR-007)     │
      │         tx.stockMovement.create({ direction: 'IN', … })                       │
      │         tx.rawMaterial.update({ currentStock: { increment: quantity } })      │
      │                                                                              │
      │ 9. ╔══════════════════════════════════════════════════════════════════════╗   │
      │    ║  THE ADR-006 BRANCH — the only `if` on paymentStatus in this repo    ║   │
      │    ╠══════════════════════════════════════════════════════════════════════╣   │
      │    ║  if (dto.paymentStatus === 'PAID') {                                 ║   │
      │    ║    branchIdForLedger = await resolveLedgerBranchId(tx,               ║   │
      │    ║                            purchase.branchId)     // §3 / L3         ║   │
      │    ║    categoryId        = await resolvePurchaseCategoryId(tx)           ║   │
      │    ║    entry = ledgerEntries.createSystemEntry(tx, {                     ║   │
      │    ║      accountId: dto.accountId!,   categoryId,                        ║   │
      │    ║      branchId: branchIdForLedger, entryDate: purchase.purchaseDate,  ║   │
      │    ║      amount: totalAmount,         type: 'OUTFLOW',                   ║   │
      │    ║      sourceType: 'PURCHASE',      sourceId: purchase.id,             ║   │
      │    ║    })                                                                ║   │
      │    ║    tx.supplierPurchase.update({ ledgerEntryId: entry.id })           ║   │
      │    ║    // NO Payable is created. Ever. (ERD §6 mutual exclusion.)        ║   │
      │    ║  } else {                          // 'UNPAID'                       ║   │
      │    ║    tx.payable.create({ supplierPurchaseId: purchase.id,              ║   │
      │    ║      supplierId, originalAmount: totalAmount,                        ║   │
      │    ║      remainingBalance: totalAmount, status: 'OPEN' })                ║   │
      │    ║    // NO LedgerEntry. The money has not moved (ADR-006).             ║   │
      │    ║  }                                                                   ║   │
      │    ╚══════════════════════════════════════════════════════════════════════╝   │
      │                                                                              │
      │ 10. reload the purchase with items+supplier+payable, return via mapper       │
      └───────────────────────────── COMMIT ─────────────────────────────────────────┘

  Any throw between 6 and 10 rolls back ALL of it — no orphan stock, no orphan
  ledger entry, no orphan payable. This is the guarantee e2e case 7 proves.
```

`resolveLedgerBranchId` and `resolvePurchaseCategoryId` live in `apps/api/src/common/system-refs.ts`
as plain exported async functions (not Nest providers — same rationale as `hpp.calculator.ts`):

```ts
/** ADR-014 (plan §3): LedgerEntry.branchId is NOT NULL, but a central purchase
 *  has no branch. Central ledger entries are attributed to the seeded central
 *  kitchen branch. `SupplierPurchase.branchId = null` remains the ONLY marker
 *  for "central" — Pusat is never accepted from a client. */
export const CENTRAL_BRANCH_NAME = 'Pusat (Dapur Sentral)';
export const PURCHASE_CATEGORY_NAME = 'Pembelian Bahan Baku';

export async function resolveLedgerBranchId(
  tx: Prisma.TransactionClient,
  purchaseBranchId: string | null,
): Promise<string> {
  if (purchaseBranchId) return purchaseBranchId;
  const central = await tx.branch.findUnique({ where: { name: CENTRAL_BRANCH_NAME } });
  if (!central) {
    // An environment fault, not a client error: the seed owns this row.
    throw new InternalServerErrorException(
      `System branch "${CENTRAL_BRANCH_NAME}" is missing — run \`pnpm --filter api db:seed\``,
    );
  }
  return central.id;
}
```

`resolvePurchaseCategoryId` is the same shape against `Category.name` (unique — `schema.prisma:97`).
**No caching.** Two indexed unique lookups per purchase cost nothing, and a cache would survive a
`migrate reset` between e2e suites and hand back a dead id.

### 9.5 `StockMovementsService.applyInbound` — literal signature and the deadlock rule

```ts
/**
 * OhMyPos — the single authority for RawMaterial.currentStock (System Design §7,
 * ADR-007). The StockMovement log is the source of truth; currentStock is the
 * fast-read balance, and it is only ever written here, in the same transaction
 * as the movement that justifies it.
 *
 * Takes the caller's `tx` rather than using its own client: the purchase, the
 * stock movement and the ledger entry must share ONE transaction boundary
 * (Playbook §7). A method that opened its own transaction here would silently
 * break that.
 *
 * Phase 4 writes IN only. Phase 5 adds the OUT counterpart (which additionally
 * asserts the balance never goes negative and throws InsufficientStockException).
 */
import { Prisma } from '../../generated/prisma/client';

export interface InboundStockLine {
  rawMaterialId: string;
  quantity: Prisma.Decimal;
  unitCost: Prisma.Decimal;
}

export interface InboundStockInput {
  branchId: string | null;
  referenceType: 'PURCHASE';
  referenceId: string;
  movementDate: Date;
  lines: InboundStockLine[];
}

@Injectable()
export class StockMovementsService {
  async applyInbound(tx: Prisma.TransactionClient, input: InboundStockInput): Promise<void> {
    // Lock in ascending rawMaterialId order. Two concurrent purchases touching
    // {A,B} and {B,A} would otherwise take the locks in opposite order and
    // deadlock; Postgres would abort one of them with a 40P01 at commit time,
    // which is a 500 the caller cannot act on. A deterministic order makes the
    // second transaction simply wait.
    const lines = [...input.lines].sort((a, b) =>
      a.rawMaterialId.localeCompare(b.rawMaterialId),
    );

    for (const line of lines) {
      // `id` is a TEXT column (Prisma String @id) — no ::uuid cast. Casting here
      // is the bug TASK-003's handoff records: it made every allocation a 500.
      await tx.$queryRaw`SELECT id FROM raw_materials WHERE id = ${line.rawMaterialId} FOR UPDATE`;

      await tx.stockMovement.create({
        data: {
          rawMaterialId: line.rawMaterialId,
          branchId: input.branchId,
          direction: 'IN',
          quantity: line.quantity,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          unitCostAtMovement: line.unitCost,
          movementDate: input.movementDate,
        },
      });

      // `increment` is an atomic UPDATE … SET x = x + n, so the balance is never
      // read into JS and written back. The FOR UPDATE above is still required:
      // it serializes the whole movement+balance pair, not just the arithmetic.
      await tx.rawMaterial.update({
        where: { id: line.rawMaterialId },
        data: { currentStock: { increment: line.quantity } },
      });

      // Deliberately NOT updating rawMaterial.unitCost — see plan §5 / DEBT-006.
      // Writing the purchase price back here would change every product's live
      // HPP (ADR-005) and is a costing-method decision with no ADR behind it.
    }
  }
}
```

### 9.6 Flow 2 — `PayableSettlement` creation: one transaction, one lock

```
POST /payables/:id/settlements
  │
  ├─ [OUTSIDE tx] RoleGuard @Roles('OWNER')            (decision 5)
  ├─ [OUTSIDE tx] ZodValidationPipe: CreatePayableSettlementSchema  (§7.3)
  │
  └─ $transaction ───────────────────────────────────────────────────────────────────┐
      │                                                                              │
      │ 1. ⚠️ LOCK FIRST, READ SECOND — this order is the whole correctness argument │
      │    SELECT id FROM payables WHERE id = ${payableId} FOR UPDATE                 │
      │    (raw query; `id` is TEXT, no ::uuid cast)                                  │
      │                                                                              │
      │ 2. payable = tx.payable.findUnique({ id, include: { supplierPurchase } })     │
      │       → NotFoundException if missing                                          │
      │    // Read AFTER the lock. Reading first and locking after re-opens the       │
      │    // exact race the lock exists to close.                                    │
      │                                                                              │
      │ 3. tx.account.findUnique(dto.accountId)  → 404 if missing                     │
      │                                                                              │
      │ 4. assertSettlable(payable.status, payable.remainingBalance, amount)  ← pure  │
      │       status === 'SETTLED'        → PayableAlreadySettledException      (409) │
      │       amount > remainingBalance   → SettlementExceedsPayableException   (400) │
      │                                                                              │
      │ 5. newRemaining = remainingBalance.minus(amount)         // exact Decimal     │
      │    newStatus    = newRemaining.isZero() ? 'SETTLED' : 'PARTIALLY_SETTLED'     │
      │                                                                              │
      │ 6. LEDGER — unconditional here, and this is the OTHER half of ADR-006:        │
      │    branchIdForLedger = resolveLedgerBranchId(tx,                              │
      │                          payable.supplierPurchase.branchId)                   │
      │    entry = ledgerEntries.createSystemEntry(tx, {                              │
      │      accountId: dto.accountId, categoryId: resolvePurchaseCategoryId(tx),     │
      │      branchId: branchIdForLedger, entryDate: dto.settledAt,                   │
      │      amount,                     type: 'OUTFLOW',                             │
      │      sourceType: 'PAYABLE_SETTLEMENT', sourceId: <settlement id, step 7>,     │
      │    })                                                                         │
      │                                                                              │
      │ 7. settlement = tx.payableSettlement.create({ payableId, accountId,           │
      │      ledgerEntryId: entry.id, amount, settledAt, note })                      │
      │    then tx.ledgerEntry.update({ where: { id: entry.id },                      │
      │                                 data: { sourceId: settlement.id } })          │
      │    // Two-step because each row references the other. The update is inside    │
      │    // the same tx, so no observer ever sees the entry with a null sourceId.    │
      │                                                                              │
      │ 8. tx.payable.update({ remainingBalance: newRemaining, status: newStatus })    │
      │                                                                              │
      │ 9. tx.supplierPurchase.update({ where: { id: payable.supplierPurchaseId },     │
      │      data: { paymentStatus: newStatus === 'SETTLED' ? 'PAID'                  │
      │                                                    : 'PARTIALLY_PAID' } })     │
      │    // §4 / decision 3. The purchase's ledgerEntryId stays null forever —      │
      │    // the expense lives on the settlements' entries.                          │
      │                                                                              │
      │ 10. reload + return via payables.mapper                                       │
      └───────────────────────────── COMMIT ─────────────────────────────────────────┘

  Writes to LedgerEntry + Payable (+ SupplierPurchase) in one transaction —
  Playbook §7's rule, satisfied by construction.
```

`payables.rules.ts`, the pure half, so over-settlement logic is unit-testable without a database:

```ts
/**
 * Pure — no Prisma, no Nest. Playbook §10 puts the Payable/PayableSettlement
 * flow in the "must have thorough tests" tier; keeping the rule pure is what
 * makes exhaustive tests cheap.
 */
export function assertSettlable(
  status: PayableStatus,
  remainingBalance: Prisma.Decimal,
  amount: Prisma.Decimal,
): void {
  // Checked before the amount comparison: "already settled" is a more precise
  // diagnosis than "amount exceeds 0" and deserves its own 409.
  if (status === 'SETTLED' || remainingBalance.lessThanOrEqualTo(0)) {
    throw new PayableAlreadySettledException();
  }
  if (amount.greaterThan(remainingBalance)) {
    throw new SettlementExceedsPayableException(amount, remainingBalance);
  }
}
```

`assertSettlable` throws the domain exceptions directly rather than returning a result, matching
how the repo's other validation reads. It stays a pure function — an exception is not a side
effect on state.

### 9.7 `LedgerEntriesService.createSystemEntry` — the one method added to a Phase 1 module

```ts
/**
 * Creates a system-generated entry inside the CALLER'S transaction (Playbook §3,
 * §7). New modules must not write `ledger_entries` directly; they call this.
 *
 * Takes `tx`, never `this.prisma` — a Sale, a Purchase and a Settlement each
 * need the entry to commit or roll back with the rest of their flow.
 *
 * `sourceType` is never MANUAL here: MANUAL is what `create()` above produces,
 * and `update()` refuses to edit anything that is not MANUAL (TASK-003 note 7).
 */
async createSystemEntry(
  tx: Prisma.TransactionClient,
  input: {
    accountId: string;
    categoryId: string;
    branchId: string;
    entryDate: Date;
    amount: Prisma.Decimal;
    type: TransactionType;
    sourceType: Exclude<LedgerSourceType, 'MANUAL'>;
    sourceId: string | null;
    note?: string | null;
  },
) {
  return tx.ledgerEntry.create({ data: { ...input, note: input.note ?? null } });
}
```

Do not change `create`, `findAll`, `findOne`, `update`, `remove`, or `assertReferencesExist`.

### 9.8 Error mapping — mechanism, not just exception name

| Situation | Mechanism | Result |
|---|---|---|
| Duplicate `Supplier.name` | attempt the write, catch `Prisma.PrismaClientKnownRequestError` with `code === 'P2002'` (pattern at `raw-materials.service.ts:54-62`) | `SupplierNameTakenException` extends `ConflictException` → 409 |
| Delete a `Supplier` that has purchases or payables | attempt the delete, catch `code === 'P2003'` | `SupplierInUseException` extends `ConflictException` → 409 |
| A `rawMaterialId` in the purchase payload does not exist | inside the tx: `findMany({ where: { id: { in: ids } } })`, set-compare — **not** a pre-check outside the transaction | `PurchaseItemMaterialNotFoundException(missingIds)` extends `NotFoundException` → 404 |
| Duplicate `rawMaterialId` in one payload | `CreateSupplierPurchaseSchema.superRefine` (§7.2) | 400, no exception class |
| `paymentStatus: 'PARTIALLY_PAID'` at creation | `PurchasePaymentStatusInput` enum (§7.1) | 400, no exception class |
| `PAID` without `accountId`, or `UNPAID` with one | `superRefine` (§7.2) | 400, no exception class |
| Settlement amount exceeds the remaining balance | `assertSettlable` (§9.6) | `SettlementExceedsPayableException` extends **`BadRequestException`** → 400 |
| Settlement against a fully-settled payable | `assertSettlable` | `PayableAlreadySettledException` extends **`ConflictException`** → 409 |
| `Supplier` / `Branch` / `Account` / `Payable` not found by id | `findUnique` + `NotFoundException`, exactly `accounts.service.ts`'s pattern | 404 |
| Central branch or purchase category row missing | `resolveLedgerBranchId` / `resolvePurchaseCategoryId` | `InternalServerErrorException` naming the seed command → 500 (it is an environment fault, not a client error) |

Why 400 for over-settlement but 409 for already-settled: over-settlement is a bad *argument*
relative to current state, which is how `AllocationService` already reports exceeding the
allocation cap (`allocation.service.ts:105-109` → `BadRequestException`). Already-settled is a
*state* conflict — the request would be valid against a different state — which is the same shape
as `LedgerEntriesService.update`'s refusal (`ConflictException`). Follow the precedents rather
than inventing a third convention.

**No pre-check-then-write anywhere.** `findUnique`-then-`create` on a unique column is a TOCTOU
race under concurrency; catch the constraint instead.

**Exception inventory — exactly six classes, each with exactly one trigger.** Create no others.
Each sets `this.name` in its constructor, matching `raw-materials.exceptions.ts` and
`users.exceptions.ts` — the class name is what identifies the broken rule in a log line.

| Class | File | Base | Trigger |
|---|---|---|---|
| `SupplierNameTakenException` | `suppliers.exceptions.ts` | `ConflictException` | P2002 on `Supplier.name` |
| `SupplierInUseException` | `suppliers.exceptions.ts` | `ConflictException` | P2003 deleting a referenced supplier |
| `PurchaseItemMaterialNotFoundException` | `supplier-purchases.exceptions.ts` | `NotFoundException` | unknown `rawMaterialId` in a purchase payload |
| `CentralBranchNotAssignableException` | `supplier-purchases.exceptions.ts` | `BadRequestException` | a purchase whose `branchId` is the `Pusat (Dapur Sentral)` row (ADR-014) |
| `PayableAlreadySettledException` | `payables.exceptions.ts` | `ConflictException` | settlement against `status = SETTLED` |
| `SettlementExceedsPayableException` | `payables.exceptions.ts` | `BadRequestException` | `amount > remainingBalance` |

> **Added 2026-08-16, during review.** `CentralBranchNotAssignableException` was not in
> the original five. §3 treated "never send `Pusat` as a purchase branch" as a
> documentation-level mitigation, but ADR-014 as written asserted the API *rejects* it,
> and nothing did — an `ADMIN`/`OWNER` could create a purchase attributed to `Pusat`
> that would then report `isCentral: false`. Enforcing it is six lines and makes the
> ADR true; leaving it as prose would have made the ADR a claim the code did not honour.

Names deliberately **not** created, each of which would be dead code inviting a wrong throw site:

- `InsufficientStockException` — Playbook §6 defines it for the **Phase 5** sale flow. A purchase
  only ever increases stock, so it has no trigger here.
- `UnknownRawMaterialException` — already exists in `recipes.exceptions.ts` for the recipe payload.
  Do not import it into the purchases module and do not create a second class with the same name;
  `PurchaseItemMaterialNotFoundException` is this module's own, per the Phase 3 rule that a
  module never reuses another module's exception.
- `PayableNotFoundException` — plain `NotFoundException`, matching every other "not found by id"
  in the repo.
- `CentralBranchMissingException` — an environment fault, not a domain rule.

### 9.9 Seed fixtures — hand-checkable numbers

Extend `prisma/seed.ts`. The e2e assertions use these exact strings, so §10's "verify by hand" is
executable.

**Central branch (required by §3 / ADR-014):**

```ts
await prisma.branch.upsert({
  where: { name: 'Pusat (Dapur Sentral)' },
  update: {},
  create: { name: 'Pusat (Dapur Sentral)', address: 'Dapur Sentral' },
});
```

Add it **before** the two existing branch rows are used, and add a comment saying it is a system
row that `resolveLedgerBranchId` depends on — not a real sales outlet, and never assigned to a
`KASIR`.

**Suppliers:** `Toko Sumber Rejeki` (contact `0812-1111-2222`), `CV Kopi Nusantara` (contact
`0813-3333-4444`).

**Purchase A — central, PAID.** From `CV Kopi Nusantara`, `branchId = null`, paid from
`Bank Utama`:

```
Kopi   2.0000 kg × 85000.00 = 170000.00
Gula  10.0000 kg × 12000.00 = 120000.00
                              ---------
                totalAmount = 290000.00
```

Expected after seeding: one `LedgerEntry` (`OUTFLOW`, `290000.00`, `sourceType = PURCHASE`,
`branchId = <Pusat>`), **zero** `Payable` rows for it, `Kopi.currentStock` `5.0000 → 7.0000`,
`Gula.currentStock` `10.0000 → 20.0000`, two `StockMovement` rows with `direction = IN`.

**Purchase B — branch-scoped, UNPAID.** From `Toko Sumber Rejeki`,
`branchId = <Cabang Melati>`:

```
Gula   5.0000 kg × 12000.00 =  60000.00
                              ---------
                totalAmount =  60000.00
```

Expected: **zero** `LedgerEntry` rows for it (this is the ADR-006 fixture), one `Payable` with
`originalAmount = 60000.00`, `remainingBalance = 60000.00`, `status = OPEN`, and
`Gula.currentStock 20.0000 → 25.0000`.

**Settlement on Purchase B's payable — partial, `20000.00` from `Kas Tunai`.** Expected after:
`remainingBalance = 40000.00`, `Payable.status = PARTIALLY_SETTLED`,
`SupplierPurchase.paymentStatus = PARTIALLY_PAID`, exactly one `LedgerEntry` with
`sourceType = PAYABLE_SETTLEMENT` and `amount = 20000.00`.

The seed must produce these by calling the same services the API calls, **not** by writing rows
directly — a seed that hand-writes a payable is a second write path to `remainingBalance` and
voids the "exactly one writer" argument in §2. If wiring the Nest container into the seed is
awkward, the acceptable alternative is to reproduce the flows through `prisma.$transaction` in the
seed **and** state in a comment that these are the only sanctioned duplicates, with the assertion
in §10 covering it. Prefer the service route.

### 9.10 Test plan (Playbook §10)

Playbook §10 puts the `Payable`/`PayableSettlement` flow in the **"must have thorough tests"**
tier, alongside `Sale` and the allocation-sum constraint. Supplier CRUD is "should have".

#### Tier 1 — `purchase-totals.spec.ts` (pure, no database)

- Single line, exact arithmetic: `2.0000 × 85000.00 = 170000.00`
- Multi-line sum equals the hand-computed total
- **Rounding proof:** lines whose exact products carry >2dp (e.g. `0.3333 × 1000.00 = 333.30`,
  `1.2345 × 99.99 = 123.44`) — assert each `lineTotal` is the HALF_UP 2dp value **and** that
  `totalAmount` is the sum of those rounded values, not the rounded sum of exact values. Pick
  inputs where the two differ, or the test proves nothing.
- 4dp quantity × 2dp cost at 18-digit boundaries → assert the result is a `Prisma.Decimal` and
  equals a value a JS `number` would mangle
- Empty line list → `0.00` (a purchase with no items is rejected by Zod's `.min(1)`, but the
  calculator must not throw)

#### Tier 1 — `payables.rules.spec.ts` (pure, no database)

- `remaining = 60000.00`, `amount = 20000.00` → passes
- `amount === remaining` exactly → passes (a full settlement is not an over-settlement)
- `amount = remaining + 0.01` → `SettlementExceedsPayableException`
- `status = 'SETTLED'` → `PayableAlreadySettledException`, **even when `amount` is tiny** — assert
  the status check wins over the amount check
- `remaining = 0.00` with `status = 'PARTIALLY_SETTLED'` (a state that should not occur but must
  fail safe) → `PayableAlreadySettledException`
- `status = 'OPEN'`, `amount = 0.01` against `remaining = 0.01` → passes

#### Tier 2 — `purchasing-payables.e2e-spec.ts` (real Postgres, auth-aware)

Follow `master-data.e2e-spec.ts`'s structure exactly: `beforeAll` creates a branch and three users
(`OWNER`, `ADMIN`, `KASIR`) and logs each in for cookies; `cleanup()` deletes this suite's rows in
FK-safe order and runs in both `beforeAll` and `afterAll`. Every request authenticates — TASK-004's
handoff: there is no unguarded path left.

Cleanup order (children first): `payableSettlement` → `payable` → `supplierPurchaseItem` →
`supplierPurchase` → `stockMovement` → `ledgerEntry` (this suite's only) → `supplier` →
`rawMaterial` → `user` → `branch`.

**The ADR-006 branch — the cases the prompt names:**

1. **PAID purchase creates a ledger entry and no payable.** Assert: response `ledgerEntryId` is
   non-null and `payableId` is null; exactly one `LedgerEntry` exists with
   `sourceType: 'PURCHASE'`, `sourceId: <purchase.id>`, `type: 'OUTFLOW'`, `amount` equal to the
   computed total; and `prisma.payable.count({ where: { supplierPurchaseId } })` is **0**.
2. **UNPAID purchase creates a payable and no ledger entry.** Assert: `ledgerEntryId` is null;
   `prisma.ledgerEntry.count({ where: { sourceType: 'PURCHASE', sourceId: purchase.id } })` is
   **0** — this is the assertion that catches the mistake AGENTS.md's troubleshooting table names;
   and the `Payable` exists with `remainingBalance === originalAmount`, `status: 'OPEN'`.
3. **Stock moves in both cases.** For each of 1 and 2, assert `RawMaterial.currentStock` increased
   by exactly the purchased quantity and one `StockMovement` row exists per line with
   `direction: 'IN'`, `referenceType: 'PURCHASE'`, `referenceId: purchase.id`, and
   `unitCostAtMovement` equal to the line's `unitCost`. The asymmetry — stock always, money
   sometimes — is the point.

**Settlement:**

4. **Partial settlement.** `60000.00` payable, settle `20000.00` → `remainingBalance` is
   **exactly** `"40000.00"` (string compare), `status: 'PARTIALLY_SETTLED'`, parent purchase
   `paymentStatus: 'PARTIALLY_PAID'`, exactly one `LedgerEntry` with
   `sourceType: 'PAYABLE_SETTLEMENT'` and `amount: "20000.00"` — **not** the payable's original
   amount.
5. **Settlement to zero.** Settle the remaining `40000.00` → `remainingBalance: "0.00"`,
   `status: 'SETTLED'`, purchase `paymentStatus: 'PAID'`, purchase `ledgerEntryId` **still null**
   (§4), two settlement ledger entries whose amounts sum to `originalAmount`.
6. **Over-settlement is rejected and writes nothing.** On a `40000.00` remaining balance, settle
   `40000.01` → **400**. Then assert, in the same test: `remainingBalance` is still `"40000.00"`,
   the settlement count is unchanged, and no new `LedgerEntry` exists. Asserting only the status
   code would pass even if the transaction had partially committed.
7. **Settling an already-settled payable.** After case 5, settle `1.00` → **409**, message
   mentioning the payable is settled. Again assert nothing was written.
8. **Concurrency — the lock actually works.** On a payable with `remaining = 40000.00`, fire two
   `POST /payables/:id/settlements` for `40000.00` each with `Promise.allSettled`. Assert exactly
   one 2xx and one 400, and that `remainingBalance` ends at `"0.00"` with exactly one settlement
   row. Without the `FOR UPDATE` in §9.6 step 1 this test fails — that is why it exists.
   (Precedent: `allocation-sum.e2e-spec.ts` proves the allocation invariant the same way.)

**Rollback:**

9. **Purchase rolls back completely on a mid-transaction failure.** Send a two-line purchase where
   line 2's `rawMaterialId` is a valid but non-existent UUID → **404**. Assert: no
   `SupplierPurchase` row for that supplier+date, no `StockMovement`, line 1's raw material
   `currentStock` **unchanged**, no `LedgerEntry`, no `Payable`. This is Playbook §7's guarantee.

**Guards — the central-purchase case, made explicit (§6.6b):**

10. `OWNER` `POST` with `branchId: null` → **201**, response `branchId: null`, `isCentral: true`,
    and the generated `LedgerEntry.branchId` equals the `Pusat (Dapur Sentral)` branch id.
11. `KASIR` `POST` with `branchId: null` → **403** (a cashier cannot record a central purchase).
12. `KASIR` `POST` with `branchId` omitted entirely → **403** from the guard, **not 400** from Zod
    — guards run before pipes.
13. `KASIR` `POST` with their **own** `branchId` → **201**.
14. `KASIR` `POST` with **another** branch's id → **403**.
15. `KASIR` `GET /supplier-purchases?branchId=<own>` → 200, and the body contains none of the
    central purchases created in case 10. Seed a second branch's purchase so the assertion is
    meaningful (ERR-002's lesson).
16. `KASIR` and `ADMIN` `POST /payables/:id/settlements` → **403**; `OWNER` → 201.
17. `KASIR` `GET /payables` → **403**.
18. Unauthenticated request to any of the above → **401**.
19. `KASIR` `POST /suppliers` → **403**; `KASIR` `GET /suppliers` → **200**.

**Contract / decimal discipline:**

20. Money comes back with scale intact — assert `totalAmount === "290000.00"` and
    `remainingBalance === "40000.00"` as **literal strings**, never `toBeDefined()`. This is the
    `toJSON()` trap from TASK-005 §9.3; a loose assertion is exactly what lets it through.
    Quantities likewise assert 4dp (`"2.0000"`).
21. `paymentStatus: 'PARTIALLY_PAID'` in a create payload → **400**.
22. `paymentStatus: 'PAID'` with no `accountId` → **400**; `'UNPAID'` **with** an `accountId` →
    **400**.
23. Duplicate `rawMaterialId` across two items → **400**. `quantity: "0"` → **400**. 5dp quantity
    → **400**. 3dp money → **400**. `items: []` → **400**.
24. A client-supplied `totalAmount: "1.00"` is ignored — the stored total is the computed one.
25. Deleting a supplier that has purchases → **409** `SupplierInUseException`, and the supplier
    still exists afterwards.
26. `GET /payables/summary` returns one row per supplier with `totalOutstanding` equal to the sum
    of that supplier's `remainingBalance` values — assert against a hand-computed figure across
    two payables for the same supplier (PRD §5.3).
27. **Balance integrity:** after all of the above, re-derive every payable's balance as
    `originalAmount − sum(settlement.amount)` straight from the rows and assert it equals the
    stored `remainingBalance`. This is the test that keeps Option B honest (§2).

---

## 10. Sequencing, gates, and definition of done

### 10.1 Sequence

1. **Confirm the six decisions in §1.** ⚠️ Gate.
2. Write **ADR-014** (central branch for central-purchase ledger attribution, §3). Add
   **DEBT-006** (`unitCost` not updated by purchases, §5) and **DEBT-007** (no settlement-sum
   trigger, §2 Option D) to `08 - Tech_Debt_Log.md`.
3. Run the `migrate diff` pre-flight in §8.5; reset the dev database if it is drifted.
4. **Schema + migration.** ⚠️ Gate: explicit go-ahead before `schema.prisma` is touched.
5. Enums + the four Zod contract files; export from `index.ts`.
6. **Pure calculators and their unit tests first** — `purchase-totals.ts`, `payables.rules.ts`.
   Everything else depends on these being right, and they need no database.
7. `common/system-refs.ts`.
8. `LedgerEntriesService.createSystemEntry` (one method, §9.7).
9. `suppliers` module (simplest, proves the CRUD/exception shape).
10. `stock-movements` module.
11. `supplier-purchases` module (needs 7–10).
12. `payables` module.
13. Seed fixtures (§9.9).
14. `purchasing-payables.e2e-spec.ts`.
15. `pnpm turbo run lint typecheck test build` and `pnpm --filter api test:e2e`, green locally.
16. Log the work: **TASK-006** in `07 - Task_Log.md`; anything that bit you in
    `06 - Error_Log.md`; anything deferred in `08 - Tech_Debt_Log.md` (AGENTS.md §6).

Steps 9–12 are in dependency order and each leaves the repo in a working, committable state.

### 10.2 Explicitly out of scope

The `apps/web` UI for Dashboard 2.2 (`app/(back-office)/expenses/page.tsx` stays the Phase 2
placeholder — that is Phase 8d); general (non-raw-material) business expenses, which PRD §5.3 also
covers but which need no `Supplier`/`Payable`/`StockMovement` and belong with the expenses UI;
outbound `StockMovement` and the `Sale` flow (Phase 5); `OpeningStock` and `GET /stock-movements`
(Phase 6); the inventory summary (Phase 6); reporting over any of this (Phase 7); editing or
deleting a `SupplierPurchase` after creation (no requirement in any document — a purchase is
corrected by recording a compensating movement, and adding an edit path would need its own
transaction-boundary analysis); revoking a `PayableSettlement`; the Phase 1 guard inconsistency in
§6.5; DEBT-004's tax/discount questions.

**No new dependencies are required.** Everything needed is installed.

### 10.3 Definition of done

Before reporting Phase 4 complete, all of the following must hold:

- [ ] `pnpm turbo run lint typecheck test build` green
- [ ] `pnpm --filter api test:e2e` green, including the concurrency case (8), the rollback case
      (9), and the balance-integrity case (27)
- [ ] **e2e green in BOTH orders**: `db:seed` → `test:e2e`, and `test:e2e` → `test:e2e`. A run
      against an unseeded (or already-wiped) database does not exercise cleanup ordering, and
      CI seeds first. Any suite that wipes a table this phase added a `Restrict` child to must
      delete those children first — see **ERR-004**, which this check exists because of
- [ ] The `migrate diff` pre-flight (§8.5) prints no changes against the final schema
- [ ] **The ADR-006 branch exists exactly once.** `grep -rn "paymentStatus === 'PAID'\|paymentStatus == 'PAID'" apps/api/src` returns exactly one line, in `supplier-purchases.service.ts`
- [ ] **No ledger entry is created on the unpaid path.** In `supplier-purchases.service.ts`, the
      `else` branch of that `if` contains no `createSystemEntry` and no `ledgerEntry` reference —
      verify by reading the branch, and e2e case 2 asserts it at runtime
- [ ] **Both flows are one transaction each.** `grep -c "\$transaction" supplier-purchases.service.ts payables.service.ts` returns 1 for each
- [ ] **No `this.prisma` inside any `$transaction` callback** — check between each
      `$transaction(async (tx) => {` line and its closing `});`, not by a naive file-wide grep
      (legitimate non-transactional reads exist in the same files)
- [ ] **The two locks are present.** `grep -rn "FOR UPDATE" apps/api/src/modules` shows the
      `raw_materials` lock in `stock-movements.service.ts` and the `payables` lock in
      `payables.service.ts` — plus the pre-existing `bank_transactions` one in
      `allocation.service.ts`. Neither new one casts `id` to `::uuid` (TASK-003's bug)
- [ ] **The payable lock comes before the read.** In `payables.service.ts`, the `$queryRaw … FOR
      UPDATE` line precedes the `tx.payable.findUnique` line
- [ ] **`remainingBalance` has exactly one writer.** `grep -rn "remainingBalance" apps/api/src` shows
      it written only in `payables.service.ts` (`settle`) and in the initial `payable.create` in
      `supplier-purchases.service.ts`; everywhere else it is read or mapped
- [ ] **`paymentStatus` has exactly two writers.** `grep -rn "paymentStatus:" apps/api/src` shows
      the create in `supplier-purchases.service.ts` and the update in `payables.service.ts`, and
      nothing else
- [ ] **`RawMaterial.currentStock` has exactly one writer.**
      `grep -rn "currentStock" apps/api/src/modules` shows a write only in
      `stock-movements.service.ts`; `raw-materials.service.ts` and `products.mapper.ts` only read it
- [ ] **`RawMaterial.unitCost` is never written by this phase.**
      `grep -rn "unitCost" apps/api/src/modules/{supplier-purchases,stock-movements,payables}`
      shows only reads and the `unitCostAtMovement` snapshot (§5 / DEBT-006)
- [ ] No endpoint returns a raw Prisma model; every money/quantity field went through
      `.toFixed(scale)` (§9.1)
- [ ] `grep -rn "toNumber()\|z.number()\|: any" apps/api/src/modules/{suppliers,supplier-purchases,payables,stock-movements} packages/api-contracts/src/{supplier,supplier-purchase,payable,stock-movement}.schema.ts` returns nothing except `z.number().int()` on the two documented count fields (`openPayableCount`)
- [ ] The seed produces its Phase 4 fixtures by calling `SupplierPurchasesService.create` and
      `PayablesService.settle`, not by writing rows. A hand-written balance in the seed is a
      second writer that the single-writer greps above cannot see, because they only scan
      `apps/api/src`. Check with
      `grep -nE "(supplierPurchase|supplierPurchaseItem|payable|payableSettlement|stockMovement)\.(create|createMany|update|upsert)\(" apps/api/prisma/seed.ts`
      — it must return nothing. Reads are fine: the two `supplierPurchase.findFirst` calls are
      the idempotency guards that keep re-seeding from double-counting stock. (Do **not** grep
      for `currentStock`/`totalAmount`: the Phase 3 raw-material upserts legitimately set an
      opening `currentStock`, which is an input, not a derived value.)
- [ ] Exactly the six exceptions in §9.8's inventory exist, no more:
      `grep -rn "InsufficientStockException\|PayableNotFoundException\|CentralBranchMissingException" apps/api/src` returns nothing, and
      `grep -rn "UnknownRawMaterialException" apps/api/src` still returns only the recipes module
- [ ] `grep -rn "forwardRef" apps/api/src/modules` returns nothing (§6.3)
- [ ] `stock-movements.module.ts` declares no `controllers`, with the one-line comment saying so
      is deliberate (§6.4)
- [ ] `ledger-entries.service.ts` gained exactly one method and nothing else changed —
      `git diff` on that file shows only the `createSystemEntry` addition
- [ ] The `POST /supplier-purchases` handler carries the central-purchase guard comment (§6.6b),
      and `GET /supplier-purchases/:id` carries the reason it is role-restricted (§6.6a)
- [ ] Every new `.ts` file opens with a doc comment containing an `ADR-` or `§` citation (§9.1a),
      and no file's comments are merely the ones copied from this document
- [ ] All four modules registered in `apps/api/src/app.module.ts`; all four schema files exported
      from `packages/api-contracts/src/index.ts`
- [ ] Seed runs clean on a fresh database and produces the §9.9 numbers; the e2e suite asserts
      `"290000.00"` and `"40000.00"` as literal strings
- [ ] ADR-014 written; DEBT-006 and DEBT-007 logged; TASK-006 written in `07 - Task_Log.md`
      per AGENTS.md §6
