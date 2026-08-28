# Handoff — POS feedback Phases 3–7 implemented (ADR-024)

**Repo:** `/Users/indofund.id/Documents/Yerikho/Projects/ohmypos`
**Date:** 2026-08-28
**Branch:** `feat/pos-feedback-phase-1-and-2`
**Supersedes the "not implemented" status of:** `docs/handoff/2026-08-28-pos-feedback-confirmed-requirements-phases-3-7.md`
**Plan executed:** `docs/plannings/2026-08-28-pos-feedback-phases-3-7.md` (all gates approved by the owner)

## Status — migration applied, suite green

The migration **has been applied** (dev `ohmypos_db` and e2e `ohmypos_e2e`) and the full gate is green as of 2026-08-28:

| Gate | Result |
|---|---|
| `pnpm --filter api prisma migrate deploy` | applied `20260828043000_add_purchase_units_and_product_waste`, no drift, existing rows backfilled (`purchase_unit = unit`, `conversion_factor = 1`, `waste_percent = 0`) |
| `pnpm --filter api test:e2e` | 436/436 passing, 18/18 suites, stable across 3 consecutive runs |
| `pnpm --filter api lint typecheck` | clean |
| `pnpm --filter web lint typecheck test` | clean; 467/467 unit tests; 4 pre-existing `react-hooks/incompatible-library` warnings in `components/users/*` (untouched by this work) |

`migrate deploy` was used rather than `migrate dev` — `migrate status` showed exactly one pending migration and no drift, so `deploy` applies it without any chance of a reset. Existing dev data was preserved.

Three e2e specs had to be updated because their expectations were written against the pre-ADR-024 behaviour. All three were **stale assertions, not defects** — verified by hand-computing the new figures before changing anything:

- `master-data.e2e-spec.ts` — the recipe envelope now also carries `baseHpp` and `wastePercent`.
- `purchasing-payables.e2e-spec.ts` Case 20 — `unitCost` is 6dp on the wire now; the case also asserts `purchaseQuantity` / `conversionFactor` scale.
- `monthly-cycle.e2e-spec.ts` Stages 7 and 9 — Stage 2's purchases now reprice the materials (kopi 120000→125000, susu 18000→18500, gula 14000→15500) *before* Stage 4's sales, so the HPP snapshotted onto each `SaleItem` moved 5310.00 → 5507.50 and Teh Manis 350.00 → 387.50. That cascades to cogs 39620.00 → 41265.00, netProfit 3380.00 → 1735.00, netMarginPct 1.45 → 0.74. **This is the DEBT-006 closure working as designed** — the old numbers only held because a purchase never repriced its material.

Still outstanding: **the browser smoke list (plan §9.5)** has not been run.

## What shipped

Everything is decided and justified in **ADR-024**; read that before changing any of it. Summary:

| | Before | After |
|---|---|---|
| Raw material units | one `unit` doing three jobs | `unit` (stock/recipe, immutable once stock exists) + `purchaseUnit` + `conversionFactor` |
| Purchase entry | `quantity` (normalized) + `unitCost` per line | `purchaseQuantity` (pack unit) + `lineTotal` (total price) — server derives both normalized figures |
| Purchase line record | what stock received only | what was bought **and** what stock received, both snapshotted |
| `RawMaterial.unitCost` | never updated by a purchase (DEBT-006) | set by the latest applicable purchase, in the same transaction |
| Product HPP | Σ(qty × cost) | `Σ(qty × cost) × (1 + wastePercent/100)`, rounded once |
| Per-unit cost precision | `Decimal(18,2)` | `Decimal(18,6)` — a rate, not an amount |

### The breaking change

`POST /supplier-purchases` no longer accepts `quantity` or `unitCost` on a line. API and web ship together; any other caller breaks. This is deliberate — a client-supplied unit cost is the same money-correctness hole that the deliberately-absent `totalAmount` field already closes.

### The thing that was not in the requirements

A per-unit cost is a **rate**. `Rp10.000 ÷ 3.000 gram` = `3,333333/gram`; at two decimals that is `3,33`, and a 3.000-gram recipe then costs `Rp9.990` instead of `Rp10.000` — a permanent ~0,1% HPP understatement on every gram- and ml-scale material. The handoff's two worked examples both divide exactly (`22,50/ml`, `4.500/pcs`), which is why it is invisible from the requirements. Four columns widened to `Decimal(18,6)`; everything that reaches the ledger stayed at 2dp. `purchase-totals.spec.ts` has a test that asserts both the 6dp result *and* what 2dp would have produced, so the regression is visible if anyone narrows it back.

### The thing that turned out to be already done

Phase 6 was scoped as "make stock opname use stock units". Reading the code showed opname, movement history, thresholds, makeable quantity and sale deduction **already** used `RawMaterial.unit`, which Phase 3 simply names as the stock unit. Phase 6 therefore became labelling plus a `1 kg = 1.000 gram` reading hint. No data migration, no behavior change.

## Files changed

**Schema / migration:** `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20260828043000_add_purchase_units_and_product_waste/migration.sql`, `apps/api/prisma/seed.ts`, `apps/api/prisma/seed-volume.ts`

**Contracts:** `packages/api-contracts/src/` — `primitives.ts` (new `UnitCostString`, `ConversionFactorString`, `WastePercentString`), `raw-material.schema.ts`, `supplier-purchase.schema.ts`, `product.schema.ts`, `recipe.schema.ts`, `opening-stock.schema.ts`, `stock-movement.schema.ts`

**API:** `raw-materials.service.ts` + `.exceptions.ts` + new `.spec.ts`; `supplier-purchases.service.ts` + `.mapper.ts` + `.exceptions.ts`; `purchase-totals.ts` + `.spec.ts` (rewritten); `stock-movements.service.ts` (comments + response scale); `products/hpp.calculator.ts` + `.spec.ts`, `products.mapper.ts`, `products.service.ts`; `sales/sales.service.ts`; `inventory/opening-stock.service.ts`

**Web:** `lib/decimal.ts` (new `divFixed`) + `.test.ts`; `components/expenses/PurchaseEntryFormDialog.tsx`; `components/master-data/` — `RawMaterialFormDialog.tsx`, `RawMaterialsTable.tsx`, `ProductFormDialog.tsx`, `RecipeEditorDialog.tsx`; `components/inventory/OpeningStockWorksheetTable.tsx`; plus the matching `.test.tsx` fixtures

**Docs:** `docs/02 - ADR.md` (ADR-024), `docs/03 - ERD.md` §3, `docs/01 - System_Design.md` §6.2/§6.4/§7, `docs/07 - Task_Log.md` (TASK-112…116), `docs/08 - Tech_Debt_Log.md` (DEBT-006 Resolved, DEBT-062 new)

## Traps for whoever touches this next

1. **`calculateHpp`'s waste argument defaults to zero.** That default exists so untouched call sites keep their exact old behavior — but it also means a *new* call site that forgets to pass `product.wastePercent` will silently compute a pre-waste HPP. There are exactly two call sites that must pass it: `products.mapper.ts` (live) and `sales.service.ts` (`hppAtSale`). If they ever disagree, ADR-005's live/snapshot guarantee is broken.
2. **The latest-cost query must stay inside the transaction.** It reads `supplier_purchase_items` while `applyInbound` holds `FOR UPDATE` on the material. Moving it out — or into `StockMovementsService` — reintroduces exactly the request-completion-order dependency DEBT-006 warned about.
3. **Do not reprice from `StockMovementsService`.** All three `apply*` methods now carry a comment saying why: a sale and a stock-take must never reprice a material, and `applyInbound` is also what reverses a voided sale.
4. **The purchase line's `conversionFactor` is a snapshot, not a lookup.** Reading the material's current factor when displaying an old purchase would make a packaging change rewrite history.
5. **`purchaseUnit` is required on every `prisma.rawMaterial.create`.** Roughly 30 test fixtures were updated for this; a new fixture that omits it will not compile, which is the intended outcome.
6. **The base-unit lock allows a PATCH that resubmits the same unit.** The edit form sends the whole object on every save; blocking an unchanged value would make the form unusable the moment stock exists. Only a genuine change is rejected.
7. **Seed fixtures `Gula`/`Kopi` stay at `conversionFactor = 1` deliberately.** Restating them into gram would move the seeded HPP of `4.530,00` that the Phase 4/5 e2e suites assert on. `Ayam` (ekor → pcs) is the fixture that exercises conversion, and it has no recipe and no movements so it shifts nothing.

## Verification status

| Check | Result |
|---|---|
| `turbo run lint typecheck test` | **13/13 tasks green** |
| API unit tests | 207 passed (was 199; +8 raw-materials, +5 HPP waste, rewritten purchase-totals) |
| Web unit tests | 467 passed (was 457) |
| API e2e | **Not run** — no database reachable |
| Migration applied | **No** — no database reachable |
| Browser smoke | **Not run** — depends on a migrated database |
| BEP present anywhere | No — `grep -ri '\bbep\b'` over `apps/`, `packages/`, `docs/DESIGN.md` returns nothing |

No commit, push, or PR was made. No unrelated dirty-worktree file was touched.
