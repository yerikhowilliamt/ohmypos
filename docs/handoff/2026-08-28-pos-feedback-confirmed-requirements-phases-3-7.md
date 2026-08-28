# Handoff — POS feedback: confirmed requirements for Phases 3–7

**Repo:** `/Users/indofund.id/Documents/Yerikho/Projects/ohmypos`  
**Date:** 2026-08-28  
**Audience:** Next AI model or junior developer  
**Status:** Business questions resolved; Phases 3–7 are not implemented by this handoff

## Summary

The business user has now answered all six questions that previously blocked the
remaining POS-feedback work. This document converts those conversational answers
into explicit business semantics, examples, constraints, and acceptance criteria.

Do not treat this document as approval to start coding immediately. The remaining
work will almost certainly modify `schema.prisma`, create a migration, change API
contracts, and formalize a costing decision. Per `AGENTS.md`, the next implementer
must first produce an implementation plan with at least three options and wait for
human approval. Schema/migration changes and architectural/API-contract changes
each require an explicit approval gate.

## Current repository state

- Phases 1–2 are complete in commit `4256684` on branch
  `feat/pos-feedback-phase-1-and-2`:
  - Phase 1: expense-category master data and protected system categories.
  - Phase 2: general expenses can belong to a branch or the central operation.
  - TASK-111: the edit form preserves the original branch across
    `Cabang → Pusat → Cabang`.
- Read these before planning the remaining work:
  - `docs/handoff/2026-08-25-pos-feedback-phase-1.md`
  - `docs/handoff/2026-08-25-pos-feedback-phase-2.md`
  - `docs/handoff/2026-08-25-general-expense-branch-preservation-fix.md`
- The working tree currently has unrelated user-owned changes, including
  `.gitignore`, `apps/web/next-env.d.ts`, `docs/.DS_Store`, and deleted files
  under `docs/screenshoots/`. Preserve them and do not restore, stage, or modify
  them as part of this work.

## Confirmed business answers

### 1. Purchase price is the total price for the entered purchase quantity

The spreadsheet's `Harga Beli` is not a price per purchase unit. It is the total
amount paid for the entire `Qty` on that line.

Example supplied by the business:

- Minyak goreng: `Rp45.000` total for `2 liter`.
- The stock/recipe unit is `ml`.
- `2 liter = 2.000 ml`.
- Normalized stock cost is `Rp45.000 / 2.000 ml = Rp22,50/ml`.
- A recipe using `50 ml` contributes `50 × Rp22,50 = Rp1.125` to HPP.

Required conceptual formula:

```text
normalizedStockQuantity = purchaseQuantity × conversionFactor
normalizedUnitCost      = totalPurchasePrice / normalizedStockQuantity
recipeLineCost          = recipeQuantity × normalizedUnitCost
```

Use decimal arithmetic; never JavaScript floating-point arithmetic for money or
stock. Preserve the repository's existing Prisma Decimal and round-once rules.

### 2. One active purchase form per raw material is sufficient for v1

Each raw material needs one primary purchase unit/conversion at a time. The
business generally buys core materials wholesale or in a consistent form and
almost never buys them as arbitrary retail packages.

Examples:

| Material | Purchase unit | Stock/recipe unit | Conversion |
|---|---:|---:|---:|
| Ayam | ekor | pcs | 1 ekor = 10 pcs |
| Minyak goreng | liter | ml | 1 liter = 1.000 ml |
| Tepung | kg | gram | 1 kg = 1.000 gram |
| Saus sachet | pack | pcs | 1 pack = configured number of pcs |

Do not build multiple simultaneous package variants, supplier-specific packaging,
or a general unit-conversion graph in v1. The active purchase unit and conversion
may be edited if packaging changes. Historical purchases must retain the unit,
quantity, conversion, normalized quantity, and price that applied when they were
recorded.

Changing the stock/recipe base unit after stock movements exist is not the same as
changing a purchase package. Do not silently allow it: either prohibit it once
history exists or design an explicit migration/conversion workflow and present that
choice in the implementation plan.

### 3. Live HPP uses the latest purchase cost, not weighted average

The business explicitly chose the new/latest purchase price.

Example:

```text
Old purchase: Rp45.000 / 1 ekor / 10 pcs = Rp4.500/pcs
New purchase: Rp50.000 / 1 ekor / 10 pcs = Rp5.000/pcs
Live HPP after the new purchase uses Rp5.000/pcs
```

Do not implement weighted moving average, FIFO, or batch costing.

The current code deliberately does not update `RawMaterial.unitCost` during a
purchase; see `DEBT-006` and the comment in
`StockMovementsService.applyInbound`. This task resolves the business decision
that originally blocked that write-back. The normalized cost from the latest
applicable purchase must become `RawMaterial.unitCost` inside the same Postgres
transaction as the purchase, stock movement, and ledger/payable work.

Important invariants:

- Both paid and unpaid purchases update stock and latest material cost because
  the goods have arrived; payment status only controls when money is recorded
  (ADR-006).
- Central and branch purchases feed the same centralized stock/cost pool
  (ADR-004).
- Historical `SupplierPurchaseItem` and `StockMovement.unitCostAtMovement`
  snapshots never change.
- Historical `SaleItem.hppAtSale` snapshots never change. A new purchase only
  changes live HPP and HPP snapshotted by future sales (ADR-005).
- The write must keep the existing ascending raw-material lock order and happen
  within the purchase transaction (ADR-007/ADR-016).

One technical semantic still needs to be made explicit in the plan: because
backdated purchases are supported, define “latest” as an ordered business event,
not simply whichever HTTP request finishes last. The recommended rule to evaluate
is newest `purchaseDate`, with `createdAt` as a tie-breaker. Present alternatives
and concurrency consequences before implementation; do not guess in code.

### 4. Stock opname is entered in the stock/recipe unit

Stock opname uses the normalized stock unit, not the purchase unit and not a
user-selectable mixture of both.

Examples:

- Ayam is counted in `pcs`.
- Minyak is counted in `ml`.
- Tepung is counted in `gram`.

All of these must use the same base unit:

- `RawMaterial.currentStock`
- `RawMaterial.lowStockThreshold`
- `RecipeItem.quantityUsed`
- `SupplierPurchaseItem` normalized stock quantity
- `StockMovement.quantity`
- opening-stock/stock-opname declarations

The UI may show a conversion helper, but the value persisted by stock opname is
always the stock/recipe quantity.

### 5. Waste is configured per product

Waste is a product-level percentage, not a global percentage and not a percentage
stored separately on every recipe ingredient.

The supplied spreadsheet applies waste after summing the product's recipe costs:

```text
baseHpp      = Σ(recipeQuantity × latestNormalizedUnitCost)
hppWithWaste = baseHpp × (1 + productWastePercent / 100)
```

Preserve the current HPP rule: use exact Decimal arithmetic and round once at the
end with `ROUND_HALF_UP`. The same shared HPP calculator must serve both live
product HPP and future `SaleItem.hppAtSale` snapshots so the two cannot drift.

Unless the owner explicitly changes this requirement during planning, interpret
waste as an HPP allowance only. Do not silently increase physical stock deduction
or `RecipeItem.quantityUsed`; the reference spreadsheet applies the percentage to
cost after the recipe total. Existing products should default to `0%` so current
HPP remains unchanged after migration.

The implementation plan must propose and get approval for percentage precision,
validation bounds, and the exact UI location (product form versus recipe editor).

### 6. BEP is not required

Do not implement BEP numbers, BEP simulation, BEP reports, fixed-cost allocation,
or BEP schema fields. The business does not use BEP as an operating benchmark.

The reference spreadsheet is evidence for purchase conversion and waste/HPP only;
it is not a requirement to reproduce every spreadsheet tab.

## Current model mismatch that must be addressed

Today, the system assumes purchase inputs are already normalized:

- `RawMaterial.unit` is a single free-text unit such as `kg`, `liter`, or `pcs`.
- `RawMaterial.unitCost` is already the cost per that unit.
- `SupplierPurchaseItem.quantity` is directly added to stock.
- `SupplierPurchaseItem.unitCost` is multiplied by that quantity.
- `RecipeItem.quantityUsed` uses the same `RawMaterial.unit`.
- Purchases do not update `RawMaterial.unitCost` (`DEBT-006`).
- `Product` has no waste field.

Therefore this is not a label-only frontend change. The next plan must cover the
data model, migration, Zod contracts, backend transaction, UI, response mapping,
historical snapshots, and tests together.

Prefer an additive historical model over silently changing the meaning of existing
columns. At minimum, evaluate an option where each purchase line snapshots both:

- What the user bought: purchase quantity, purchase unit, conversion factor, and
  total purchase price.
- What stock received: normalized stock quantity and normalized per-unit cost.

This is guidance for the option analysis, not pre-approval of exact column names.

## Suggested phase boundaries

The project previously agreed to seven feedback phases. Phases 1–2 are complete;
use the following boundaries for the remaining implementation planning unless the
approved plan deliberately improves the sequencing.

### Phase 3 — Raw-material purchase/stock unit model

- Define the purchase unit, stock/recipe unit, and conversion factor semantics.
- Decide the additive schema and migration strategy.
- Update raw-material contracts, API mapping, seed data, master-data form/table,
  validation, and unit tests.
- Do not modify stock quantities or HPP behavior yet except where required for a
  safe data migration.

### Phase 4 — Purchase entry conversion and latest-cost write-back

- Change purchase entry from normalized `quantity × unitCost` input to business
  input: purchase quantity plus total purchase price.
- Derive normalized stock quantity and normalized unit cost server-side.
- Snapshot original and normalized values on the purchase line/movement.
- Increment centralized stock in the stock unit.
- Update `RawMaterial.unitCost` using the approved deterministic latest-cost rule
  in the same transaction.
- Resolve and close `DEBT-006` when the behavior is shipped and verified.

### Phase 5 — Product-level waste and HPP

- Add product-level waste configuration with a backward-compatible default.
- Extend the one shared HPP calculator and all response/UI surfaces.
- Ensure future sale snapshots include waste while historical sale rows remain
  unchanged.
- Do not change physical stock consumption unless separately approved.

### Phase 6 — Stock opname and inventory unit consistency

- Make stock-opname entry and all inventory displays consistently use stock units.
- Show purchase-to-stock conversion context where it helps users, without allowing
  mixed-unit persistence.
- Verify opening-stock, movement history, low-stock threshold, makeable quantity,
  and sale deduction use the normalized unit end to end.

### Phase 7 — Cross-feature regression, migration verification, and UX closure

- Verify purchase → stock → recipe → live HPP → sale snapshot → reporting flows.
- Verify historical purchase and sale values do not change after master conversion,
  packaging edits, later purchases, or waste edits.
- Verify central/branch purchase attribution remains correct while stock/cost remain
  centralized.
- Run browser smoke tests for master data, purchase entry, recipe, stock opname,
  and POS sale.
- Confirm there is no BEP feature or misleading placeholder.
- Update ADR/ERD/System Design, Task Log, Error Log, Tech Debt Log, and handoff docs.

## Acceptance examples

### Ayam

Given:

- Purchase unit `ekor`
- Stock/recipe unit `pcs`
- Conversion `1 ekor = 10 pcs`
- Purchase quantity `1 ekor`
- Total purchase price `Rp45.000`

Then:

- Stock increases by `10 pcs`.
- Latest normalized cost is `Rp4.500/pcs`.
- A recipe using `1 pcs` contributes `Rp4.500` before product waste.

After a later applicable purchase of `1 ekor` for `Rp50.000`:

- Stock increases by another `10 pcs`.
- Live normalized cost becomes `Rp5.000/pcs`, not a weighted average.
- Live product HPP and future sale snapshots use `Rp5.000/pcs`.
- Existing `SaleItem.hppAtSale` values remain unchanged.

### Minyak goreng

Given:

- Purchase unit `liter`
- Stock/recipe unit `ml`
- Conversion `1 liter = 1.000 ml`
- Purchase quantity `2 liter`
- Total purchase price `Rp45.000`

Then:

- Stock increases by `2.000 ml`.
- Latest normalized cost is `Rp22,50/ml`.
- A recipe using `50 ml` contributes exactly `Rp1.125` before waste.

### Product waste

Given a product with base recipe HPP `Rp7.923` and waste `5%`:

- HPP after waste is `Rp8.319,15`, rounded once according to the approved money
  display/storage rule.
- The waste setting belongs to that product only.
- Another product remains unaffected.

## Minimum test matrix

The next implementation plan must include at least these tests.

### Pure/unit tests

- Purchase conversion for `ekor → pcs`, `liter → ml`, and `kg → gram`.
- Decimal precision, division, and `ROUND_HALF_UP` edge cases.
- Reject zero/negative purchase quantity, conversion factor, and total price.
- Product HPP with `0%`, `5%`, decimal waste, multiple ingredients, and empty recipe.
- One active purchase conversion per material.

### API/service tests

- Create/update/read raw material with purchase and stock units.
- Paid and unpaid purchases both update stock and latest cost.
- Purchase total is the sum of user-entered line totals, while normalized cost is
  derived rather than trusted from the client.
- A failed ledger/payable/line write rolls back stock and `RawMaterial.unitCost`.
- Backdated and concurrent purchases produce the approved deterministic latest
  cost, independent of request completion order.
- Packaging changes affect only later purchases; historical snapshots remain.
- KASIR/ADMIN/OWNER and branch/central guards remain unchanged.

### Integration/e2e tests

- New purchase changes live HPP but does not rewrite an old sale's HPP/reporting.
- Future sale snapshots the new waste-adjusted HPP.
- Stock opname accepts stock units and reconciles to movement history.
- Concurrent purchases and sales preserve stock correctness under row locks.
- Fresh migration from an empty database and migration of existing synthetic data.

### Browser smoke tests

- Raw-material form clearly distinguishes purchase unit from stock/recipe unit.
- Purchase form shows a preview such as `2 liter = 2.000 ml`, `Rp22,50/ml`, and
  the stock increase before submission.
- Recipe form uses only stock/recipe units and displays the resulting HPP.
- Product waste updates only the selected product's HPP.
- Stock opname is entered in the stock unit.

Run the repository's full required gate after targeted tests. Do not run timing-
sensitive full web tests concurrently with lint/typecheck if that creates resource
contention; TASK-111 documented one unrelated timeout under that pattern.

## Hard constraints for the next implementer

- Read `AGENTS.md` and `docs/04 - Engineering_Playbook.md` first.
- Before code, provide at least three implementation options with trade-offs and a
  recommended option; wait for approval.
- Stop and request explicit approval before editing `schema.prisma`, creating a
  migration, changing an API contract, or adding/updating dependencies.
- Zod schemas in `packages/api-contracts` remain the source of truth; update API
  and web consumers in the same change.
- Every stock/money/latest-cost write belongs in one Postgres transaction.
- Preserve `FOR UPDATE` locking and ascending raw-material lock order.
- Never use JavaScript `number` for money/conversion arithmetic and never use
  TypeScript `any`.
- Do not alter unrelated dirty-worktree files or perform unrelated refactors.
- Do not implement weighted average, multiple package variants, mixed-unit stock
  opname, historical HPP recalculation, or BEP.
- Do not commit, push, or create a PR without explicit user authorization.

## Open implementation decisions requiring approval

The six business questions are resolved. These technical details still belong in
the next implementation plan and must not be silently invented:

1. Exact additive schema/column names and migration/backfill strategy.
2. Deterministic ordering for “latest” when purchases are backdated or concurrent.
3. Whether the base stock unit becomes immutable after the first movement or gets
   a dedicated conversion migration flow.
4. Waste percentage precision, allowed range, and editing surface.
5. Exact money presentation for fractional HPP before the final 2-decimal snapshot.

## Errors and issues already known

### DEBT-006 — purchase cost does not update live material cost

- **What happens today:** Purchase lines and stock movements snapshot their entered
  unit cost, but `RawMaterial.unitCost` is untouched, so live HPP can become stale.
- **Root cause:** The costing method was intentionally deferred pending the business
  decision between latest cost and moving average.
- **Resolution now authorized at the requirements level:** Use latest purchase cost.
  The implementation still requires ADR/schema/plan approval.
- **Residual risk:** Backdated/concurrent ordering must be deterministic or the final
  cost will depend on request completion order.

### Unit labels currently hide incompatible semantics

- **What happens today:** Purchase, stock, and recipe all reuse one `unit`, which
  forces users to convert supplier quantities and costs manually.
- **Root cause:** The original model assumed all purchase input was already in the
  normalized stock unit.
- **Required resolution:** Explicit purchase-to-stock conversion with historical
  snapshots; a UI-only relabel is insufficient.
- **Residual risk:** Reinterpreting existing columns without an additive migration
  can corrupt historical quantities and costs.

## Ready-to-copy prompt for the next AI model

```text
Read AGENTS.md, docs/04 - Engineering_Playbook.md, and
docs/handoff/2026-08-28-pos-feedback-confirmed-requirements-phases-3-7.md in full.
Then inspect the literal Prisma schema, supplier-purchase transaction,
StockMovementsService, HPP calculator, shared Zod contracts, and the existing Phase
1–2 handoffs. Do not write code yet.

Produce an implementation plan for Phase 3 and Phase 4 only. The plan must contain
at least three implementation options with trade-offs, recommend one, explicitly
cover schema/migration and API-contract approval gates, define deterministic
latest-purchase ordering for backdated/concurrent purchases, and include unit,
service, e2e, migration, and browser verification. Wait for user approval before
editing any file.
```
