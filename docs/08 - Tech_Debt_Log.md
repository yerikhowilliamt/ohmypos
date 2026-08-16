# OhMyPos — Tech Debt Log

**Purpose:** Track every deliberate shortcut or simplification taken to ship v1 faster — things that are correct and acceptable for now, but that we already know will need revisiting once the product is production-ready and stable. This log is the worklist for the post-launch cleanup pass; nothing here is urgent by definition, but nothing here should be forgotten either.

**Depends on:** ADR-001–012, System Design v4 §11 (Risks / Things to Revisit)

---

## How to use this log

- Log debt the moment it's *knowingly* taken — a deliberate "this is the simple version for now" decision, not a bug (that's the Error Log) and not a TODO comment left in passing.
- A debt entry needs a **trigger condition** — the concrete signal that means it's time to pay it off (e.g. "when report queries exceed 500ms at real data volume," not "eventually"). Vague triggers make debt invisible until it's already hurting.
- Debt already identified during planning (from ADR "Alternatives considered" / "Consequences" sections and System Design §11) is seeded below — these aren't hypothetical, they're decisions we already made knowing the cost.
- When debt is paid off, don't delete the entry — mark it **Resolved**, note the date and what was done, and move it to the bottom under "Resolved." This keeps a record of what v1 actually cut corners on, for anyone auditing the project later.
- Review this log as a whole once the product is feature-complete and production-ready, per the plan — that's the trigger to schedule a dedicated cleanup pass rather than paying off debt piecemeal mid-feature-work.

---

## Entry Template

```
### DEBT-XXX — <short title>

- **Date logged:** YYYY-MM-DD
- **Found during:** <task/phase, or "Planning" if identified before implementation —
  link to Task Log entry if one exists>
- **Description:** <what was simplified/deferred, and what the "full" version would
  look like>
- **Why deferred:** <the actual reason it was acceptable to defer — not enough data
  volume yet, not enough time, waiting on a decision elsewhere, etc.>
- **Impact if unaddressed:** <what breaks or degrades if this is never paid off>
- **Trigger condition:** <the concrete signal that means it's time to fix this>
- **Proposed resolution:** <what paying this off would actually involve>
- **Priority:** Low | Medium | High
- **Status:** Open | Resolved
```

---

## Log

### DEBT-001 — Reports computed at query time, no materialized views

- **Date logged:** 2026-08-12
- **Found during:** Planning (ADR-008)
- **Description:** Dashboard 3 (P&L, top products, etc.) and Dashboard 5 (inventory summary) are computed by querying `LedgerEntry`, `SaleItem`, and `StockMovement` directly on every request, rather than from a precomputed/materialized read model.
- **Why deferred:** Simplest possible implementation for v1, and correct by construction (no cache-invalidation logic needed). Appropriate at the transaction volume of a single small multi-branch business.
- **Impact if unaddressed:** Report queries slow down as historical data accumulates, especially once several months/years of `LedgerEntry` and `StockMovement` rows exist.
- **Trigger condition:** Any report route consistently exceeds ~500ms at real production data volume, or the business's transaction volume grows meaningfully beyond current expectations.
- **Proposed resolution:** Introduce materialized views or a dedicated read-model table for the report queries, refreshed on a schedule or on write.
- **Priority:** Medium
- **Status:** Open

### DEBT-002 — Pessimistic row-lock on `RawMaterial` for stock concurrency

- **Date logged:** 2026-08-12
- **Found during:** Planning (ADR-007, System Design §11)
- **Description:** Stock decrement during `Sale` creation uses `SELECT ... FOR UPDATE` on the `RawMaterial` row, serializing concurrent sales that consume the same raw material.
- **Why deferred:** Correct and simple; no retry-handling complexity needed. Fine at the business's actual, low concurrent-transaction volume.
- **Impact if unaddressed:** Lock contention could become a bottleneck if multiple branches sell high-volume, shared-ingredient products at the same moment with meaningfully higher throughput than today.
- **Trigger condition:** Observed lock wait times or timeouts on `RawMaterial` writes under real usage.
- **Proposed resolution:** Move to optimistic concurrency (a version column on `RawMaterial`, retry on conflict) for the stock-decrement step.
- **Priority:** Low
- **Status:** Open

### DEBT-004 — Approved mockup shows features with no data model behind them

- **Date logged:** 2026-08-15
- **Found during:** Review of the Claude Design mockup (`OhMyPos App.dc.html`) — see DESIGN.md, "Approved Mockup"
- **Description:** The mockup renders several things ERD v3 has no field for: SKU and barcode scanning, a discount code (`MEMBER10`) with a discount line, an 11% tax line, an expense approval state ("menunggu persetujuan · perlu ditinjau"), an order type ("Dine-in"), and a cashier shift ("Shift #4192 · dibuka 08:12"). `SaleItem` carries `unitPriceAtSale` and `isPriceOverridden` but nothing for tax or discounts; `SupplierPurchase.paymentStatus` is `PAID`/`UNPAID`/`PARTIALLY_PAID` with no review state. Shift management is an explicit PRD §3 non-goal.
- **Why deferred:** Deliberately not built (decision recorded 2026-08-15). Rendering them as static UI would promise behaviour the system does not have, which is worse than leaving them out.
- **Impact if unaddressed:** Each is a silent expectation gap. Tax and discount in particular affect what `Sale.totalAmount` means and therefore every figure in Dashboard 3 — adding them later is a schema and reporting change, not a UI change.
- **Trigger condition:** The business owner asks for any one of them, or Phase 3's `Sale` flow is specified — whichever comes first.
- **Proposed resolution:** Take them one at a time through the normal schema-approval gate. Tax and discount should be decided together, before `Sale` is built, because both change the total's definition.
- **Priority:** Medium
- **Status:** Partially resolved (2026-08-16) — Tax, discount, and order type decided per ADR-015 (Phase 5 planning): none get schema support in v1. `Sale.totalAmount = Σ SaleItem.lineTotal`; discounts are expressed through the existing per-line price override (`unitPriceAtSale` + `isPriceOverridden`). SKU/barcode scanning, the expense approval state, and the cashier shift remain **Open** — none of the three is touched by Phase 5 and each still needs its own approval pass.

### DEBT-003 — Two vocabularies for transaction direction

- **Date logged:** 2026-08-14
- **Found during:** TASK-001 (ADR-012)
- **Description:** The schema and all backend code use Kasync's `TransactionType {INFLOW, OUTFLOW}`, while the product, the PRD, and the Indonesian-language UI speak in terms of pemasukan/pengeluaran (income/expense). The translation between the two lives in the presentation layer rather than in the data model.
- **Why deferred:** Renaming the enum to `INCOME`/`EXPENSE` would have required editing the ported `AllocationService` and `MatchingEngine`, which compare `bankTransaction.type` against `ledgerEntry.type` directly — churn on the most correctness-critical path in the system, in exchange for vocabulary alone. `INFLOW`/`OUTFLOW` is also the more accurate word for a bank transaction, which has a direction rather than a category.
- **Impact if unaddressed:** A developer reading the schema and a stakeholder reading the UI use different words for the same field, which is a standing source of small misunderstandings — and a risk of a UI label being mapped backwards without a test catching it.
- **Trigger condition:** A third vocabulary appears for the same concept, or a UI mislabelling bug is traced to this mapping.
- **Proposed resolution:** Centralise the mapping in one exported helper in `packages/ui` (or `packages/api-contracts`) so no screen translates the enum inline, and cover it with a test asserting both directions.
- **Priority:** Low
- **Status:** Open

### DEBT-006 — RawMaterial.unitCost not updated by purchases

- **Date logged:** 2026-08-16
- **Found during:** Phase 4 (Purchasing & Payables planning §5)
- **Description:** A purchase records `unitCost` per item and `StockMovement.unitCostAtMovement` snapshots it, but does not write back to `RawMaterial.unitCost`. `unitCost` remains master data updated only via `PATCH /raw-materials/:id`.
- **Why deferred:** Writing to `RawMaterial.unitCost` on purchase silently changes live HPP for all products (ADR-005) and is a costing-method decision (last-cost vs moving-average) with no approved ADR.
- **Impact if unaddressed:** Live HPP may diverge from actual recent purchase prices if master data unit costs are not kept up to date by staff.
- **Trigger condition:** The business owner reports that live HPP is stale relative to actual purchase prices.
- **Proposed resolution:** Decide the costing method explicitly in an ADR superseding or extending ADR-005 (e.g. weighted moving average or last purchase cost).
- **Priority:** Low
- **Status:** Open

### DEBT-007 — No DB-level trigger enforcing payable settlement sum constraint

- **Date logged:** 2026-08-16
- **Found during:** Phase 4 (Purchasing & Payables planning §2 Option D)
- **Description:** `Payable.remainingBalance` and settlement bounds are enforced in the service layer under `SELECT ... FOR UPDATE` row lock, rather than via a PostgreSQL trigger (`trg_check_payable_settlement_sum`).
- **Why deferred:** In v1, there is exactly one writer to `PayableSettlement` (inside `PayablesService.settle`). Adding a trigger introduces P2039 driver error unwrapping fragility (ERR-001) for a single-writer flow.
- **Impact if unaddressed:** If a future second write path (e.g. bulk data import or raw SQL migration) is introduced and omits locking, over-settlement could theoretically occur.
- **Trigger condition:** A second write path or bulk import for `PayableSettlement` is added.
- **Proposed resolution:** Add `trg_check_payable_settlement_sum` trigger in a migration, modeled on `trg_check_allocation_sum`.
- **Priority:** Low
- **Status:** Open

### DEBT-008 — Raw-material locks acquired one statement per row, not one batched `ANY($1) ORDER BY id`

- **Date logged:** 2026-08-16
- **Found during:** Phase 5 (Sales planning §2.4) — ADR-016
- **Description:** `StockMovementsService.lockRawMaterialsInIdOrder` issues one `SELECT ... FOR UPDATE` per raw material, in a loop, rather than a single `SELECT id FROM raw_materials WHERE id = ANY($1) ORDER BY id FOR UPDATE`. The batched form would cut the lock phase from M round trips to one.
- **Why deferred:** The batched form's lock ordering depends on `LockRows` sitting above `Sort` in the query plan — true today, but a query-plan dependency that no test in this repo can pin. A future planner/statistics change could reorder it with no code change, surfacing as an intermittent `40P01` in production against a green test suite. The per-statement loop's order is fixed by the calling code, not the planner, and is provable by a unit test with no database (ADR-016).
- **Impact if unaddressed:** At a realistic cart (≤ 8 products → ≤ 15 distinct materials) the extra round trips are single-digit milliseconds inside a transaction that already runs ~10 statements — negligible at current volume.
- **Trigger condition:** The lock-acquisition phase is measured as a meaningful share of sale latency at real transaction volume.
- **Proposed resolution:** Switch to the batched `ANY($1) ORDER BY id` statement, and add an `EXPLAIN`-based test (or a Postgres version pin) that asserts `LockRows` sits above `Sort` in the plan, so a planner change fails CI instead of failing silently in production.
- **Priority:** Low
- **Status:** Open

### DEBT-009 — Per-line sale price override has no role restriction

- **Date logged:** 2026-08-16
- **Found during:** Phase 5 (Sales planning §1 decision 6, §8.2)
- **Description:** `CreateSaleSchema`'s `unitPrice` override is available to `KASIR`, `ADMIN`, and `OWNER` alike — any authenticated cashier can charge below (or above) `Product.sellPrice` on any line, with no approval step and no per-role ceiling. Playbook §6 already names `PriceOverrideNotPermittedException` as an exception to add "if role-based restrictions on manual price override are added later" — v1 deliberately does not add them.
- **Why deferred:** PRD §5.2 specifies the override mechanism ("can be manually overridden for specific cases — e.g. discounts or negotiated prices") without naming who may use it or bounding it, and no ADR restricts it. Building a restriction now would be inventing a policy the business owner hasn't stated, not implementing one.
- **Impact if unaddressed:** A cashier can under-charge without any system-level check, which shows up only as a lower recorded `totalAmount` and `grossMargin` on that sale — nothing flags it as anomalous.
- **Trigger condition:** The business owner reports unauthorized or unusual discounting, or asks for an approval/ceiling policy on manual overrides.
- **Proposed resolution:** Decide the policy (a percentage ceiling, an `ADMIN`/`OWNER`-only override, or a post-hoc report of overridden lines) and encode it as a Zod refinement or a role check, raising `PriceOverrideNotPermittedException`.
- **Priority:** Low
- **Status:** Open

### DEBT-010 — No void/refund path for a `Sale`

- **Date logged:** 2026-08-16
- **Found during:** Phase 5 (Sales planning §11.2)
- **Description:** Once created, a `Sale` cannot be edited, voided, or refunded. A mis-keyed sale (wrong product, wrong quantity, double-entry) has no correction path other than manually recording compensating movements outside the system's guarantees — there is no reverse-stock-in, no reverse-ledger-entry, and no status field marking a sale as voided.
- **Why deferred:** Not in PRD §5.2's scope, and a void/refund flow needs its own transaction-boundary and ledger-reversal analysis (does it reverse the `LedgerEntry` or write an offsetting one? does stock go back to `RawMaterial.currentStock` or to a separate "returned" bucket? does `SaleItem.hppAtSale` still apply to the reversal?) — none of which any existing document answers, and Phase 5's scope is the forward flow only.
- **Impact if unaddressed:** A cashier error is currently uncorrectable within the system's own transactional guarantees. In practice this is a real F&B operational need, not a hypothetical.
- **Trigger condition:** The first mis-keyed sale in production, or the business owner asks for a void/refund flow — whichever comes first.
- **Proposed resolution:** Design a `SaleVoid`/`SaleRefund` flow (or a `Sale.status` state machine) through the normal planning-and-approval gate, once the forward flow (this phase) is stable and its transaction/lock patterns are proven.
- **Priority:** Medium
- **Status:** Open

---

## Resolved

### DEBT-005 — Approved mockup's POS and inventory contradict the stock and costing model

- **Date logged:** 2026-08-15
- **Found during:** Review of the Claude Design mockup (`OhMyPos App.dc.html`) — see DESIGN.md, "Approved Mockup"
- **Description:** Two conflicts that go deeper than missing fields. (1) The POS product grid shows a **stock count per product** ("Es Kopi Susu … 48"). In the data model, stock lives on `RawMaterial`; `Product` has no stock at all and is consumed through `RecipeItem` (ADR-004, ADR-007). A per-product number would either be a derived "how many can I still make" figure — computable, but a different thing entirely — or a second stock model. (2) The inventory panel states the stock valuation is "dihitung dari HPP rata-rata bergerak" (moving-average cost). ADR-005 specifies HPP is computed from the recipe and current `RawMaterial.unitCost`, then snapshotted onto `SaleItem` — a different costing method that produces different numbers.
- **Why deferred:** Nothing is built against either claim yet. Resolving them now would mean designing Phase 3's stock model against a mockup rather than against the ADRs, which is the wrong order.
- **Impact if unaddressed:** Phase 3 builds the POS screen straight from the mockup and either invents per-product stock or silently switches costing methods, breaking the accuracy guarantee ADR-005 exists to protect. Reports would then disagree with the ledger and nobody would know which is right.
- **Trigger condition:** Before the Phase 3 POS or inventory screen is designed — this must be settled first, not discovered mid-implementation.
- **Proposed resolution:** Decide explicitly whether the POS shows a derived "makeable quantity" (and specify how it is computed from the recipe and raw-material stock), and confirm that valuation follows ADR-005's recipe-based HPP. If moving-average costing is genuinely wanted, it supersedes ADR-005 and needs its own ADR.
- **Priority:** High — it touches money and stock correctness, which Playbook §10 puts in the "must have thorough tests" tier.
- **Status:** Resolved (2026-08-15) — Accepted per ADR-013. POS displays a derived advisory makeable quantity; moving-average costing is rejected; HPP stays recipe-based computed live via `hpp.calculator.ts`. `DESIGN.md` updated.