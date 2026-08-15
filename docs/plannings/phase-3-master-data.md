# Phase 3 — Master Data (Product / Recipe / RawMaterial) — Implementation Plan

**Status:** Implemented and reviewed against this plan (2026-08-16) — see TASK-005 in
`docs/07 - Task_Log.md`. Both gates in §8 were resolved (R1 chosen; migration approved and run
as `20260815165820_add_master_data_products_recipes_raw_materials`). Verified: `turbo run lint
typecheck test build` 15/15 green, unit 20/20, e2e 43/43, all §9.9 checks pass.
**Date:** 2026-08-15
**Scope:** PRD §5.1 "Dashboard 1" — `RawMaterial`, `RecipeItem`, `Product`
**Depends on:** PRD v1.1 §5.1, ADR-004, ADR-005, ADR-007, ADR-010, ADR-011, ADR-012, ERD v3 §3/§6/§7, Playbook v3 §3–§10 §18, Task Log TASK-002–004, Tech Debt DEBT-004/DEBT-005
**Governance:** AGENTS.md applies in full — no `schema.prisma` edit or migration without explicit approval, no Git write operations, strict scope.

---

## Decisions confirmed by the human (2026-08-15)

| # | Decision | Choice |
|---|---|---|
| 1 | DEBT-005 resolution | **Accept — write ADR-013.** Derived advisory makeable quantity; recipe-based HPP confirmed; moving-average rejected |
| 2 | Live HPP structure | **Option A** — computed at query time via a pure `hpp.calculator.ts` |
| 3 | Schema details | **Both as proposed** — `@unique` on `Product.name` / `RawMaterial.name`; `currentStock` excluded from create/update DTOs |

Still open: the recipe API shape (R1 recommended) and the go-ahead to write the migration. See §8.

---

## 1. Pre-step — DEBT-005 resolved before any code

DEBT-005 (High) asks two questions. Both are answered from the existing ADRs; neither may be assumed silently.

### Q1 — Does the POS derive a "makeable quantity" per `Product`?

**Answer: yes — derived, advisory, never stored, never authoritative.**

```
makeableQty(product) = floor( min over recipeItems of ( rawMaterial.currentStock / recipeItem.quantityUsed ) )
```

ADR-004 makes stock a single centralized `RawMaterial` pool, and ADR-007 makes the `SELECT … FOR UPDATE` decrement at sale time the **only** authority on whether stock exists. A derived
 number computed at read time is a UI hint ("you can probably make ~48 of these"), not a reservation. It cannot go stale into incorrectness, because the Phase 5 sale flow re-checks unde
r lock and throws `InsufficientStockException` regardless of what the grid displayed. The alternative — a real per-product stock field — is a second stock model and contradicts ADR-004
outright.

Edge cases, specified rather than discovered:

- Product with **no recipe** → `makeableQuantity: null` (not `0`, not `Infinity`). "Unknown" and "none" are different facts.
- A recipe item with `quantityUsed = 0` → excluded from the `min` (division by zero); rejected at write time by Zod anyway.
- The value is a snapshot at query time and is explicitly **not** part of any transaction boundary.

### Q2 — Is HPP recipe-based per ADR-005?

**Answer: yes — confirmed unchanged. Moving-average costing is rejected.**

ADR-005 stands: HPP is computed live from `RecipeItem.quantityUsed × RawMaterial.unitCost`, and snapshotted onto `SaleItem.hppAtSale` only at sale time (Phase 5). The approved mockup's
copy — *"dihitung dari HPP rata-rata bergerak"* — is wrong and must be corrected in `DESIGN.md`; it describes a costing method the system does not implement and that would produce diffe
rent numbers in every Dashboard 3 report.

### Consequence — ADR-013

> **ADR-013: `Product` has no stock; the POS shows a derived, advisory makeable quantity, and HPP stays recipe-based**
>
> Records both decisions above, explicitly rejects moving-average costing and per-product stock, and resolves DEBT-005. It does **not** supersede ADR-005 — it confirms and scopes it.

Written as **step 1 of implementation**, before the schema, because the schema depends on its answer (no `Product.hpp`, no `Product.stock`).

---

## 2. Options for structuring live HPP

### Option A — Computed at query time in the service layer ✅ **chosen**

`ProductsService` loads the product with `include: { recipeItems: { include: { rawMaterial: true } } }` and folds it through a **pure calculator function** (`hpp.calculator.ts`) using `
Prisma.Decimal`. Nothing about HPP exists in the database.

- **Pro:** literally what ADR-005 and ERD §3 specify ("no `hpp` column — never stored on `Product`"). Zero staleness by construction: change a `unitCost`, and the next read is correct w
ith no invalidation logic anywhere.
- **Pro:** the calculator is a pure function over `{quantityUsed, unitCost}[]` → exhaustively unit-testable with no database, and **Phase 5 reuses the identical function** for `SaleItem
.hppAtSale`. One implementation, so the live figure and the snapshot cannot disagree — which is the entire point of ADR-005.
- **Pro:** no schema change beyond the three new tables; no approval surface beyond what is already needed.
- **Con:** every product read joins `recipe_items` + `raw_materials`. At master-data scale (tens to low hundreds of products) this is one query with two joins. Solved with a single `inc
lude`, so no N+1.
- **Con:** the product list endpoint is heavier than a bare `SELECT * FROM products`. Acceptable; if it ever isn't, that is DEBT-001's territory, not a reason to denormalize now.

### Option B — Stored `Product.hpp`, recalculated on recipe/cost change

Write-through denormalization: an `hpp` column recomputed inside a transaction whenever a `RecipeItem` changes or a `RawMaterial.unitCost` changes.

- **Pro:** fastest reads; the product list is a plain select.
- **Con:** **contradicts ADR-005 and ERD §3** — requires a superseding ADR before a line is written.
- **Con:** the invalidation fan-out is the real cost. One `unitCost` edit must transactionally recompute *every* product whose recipe touches that material. A missed path (a seed script
, a Phase 4 bulk import, a manual `UPDATE`) leaves silently wrong HPP in every P&L report, with nothing to detect it — exactly the failure class ADR-005 exists to prevent.
- **Con:** buys performance we have no evidence of needing.

### Option C — Postgres view (`product_hpp`) or generated column

A SQL view aggregating `recipe_items ⋈ raw_materials`, mapped into Prisma as a view model.

- **Pro:** always correct like A, and the aggregation runs in the database.
- **Con:** the rounding rule now lives in SQL, so Phase 5's `hppAtSale` either duplicates it in TypeScript (two implementations that can drift — the one thing ADR-005 cannot tolerate) o
r forces the sale flow to round-trip through the view mid-transaction.
- **Con:** Prisma views need `previewFeatures = ["views"]` plus hand-written migration SQL, and are not introspected cleanly — toolchain weight for a query that is not slow.
- **Con:** harder to unit-test; correctness then requires a live database for every HPP test.

### Option D — Materialized view refreshed on write

- **Rejected:** combines Option B's invalidation problem with Option C's toolchain weight, and adds refresh scheduling that System Design §9 rules out for v1 (no background job runner).

### Two rules that follow from Option A

1. **Rounding.** Accumulate `quantityUsed(4dp) × unitCost(2dp)` at full `Decimal` precision, round **once at the end**, `ROUND_HALF_UP`, to 2dp. Rounding per line item would make HPP de
pend on how a recipe happened to be split into rows.
2. **Missing recipe → `hpp: null`**, with `hasRecipe: false` alongside. Returning `"0"` would report an infinite margin on every downstream report. `RecipeIncompleteException` (Playbook
 §6) is thrown by the **Phase 5 sale flow**, not by a read endpoint — a list endpoint that 400s because one product lacks a recipe is unusable.

---

## 3. Sub-decision — the Recipe API shape

The ERD has **no `Recipe` table**: a product's recipe *is* its set of `RecipeItem` rows, and a `Recipe` table would carry no fields of its own in v1. Keeping it that way.

- **R1 — `PUT /products/:id/recipe`, full replace, one `$transaction`** ✅ **recommended.** Body is the complete item list; the service diffs/replaces atomically. Matches how a recipe i
s actually edited (a form with rows), makes `unique(productId, rawMaterialId)` trivially satisfiable, and no intermediate half-saved recipe state can exist.
- **R2 — item-level `POST`/`PATCH`/`DELETE /recipe-items`.** More REST-orthodox, but the frontend must sequence N calls and a partial failure leaves a recipe half-old and half-new — wit
h HPP live-computed, that half-state is *visible as a wrong cost figure*.
- **R3 — recipe embedded in the `Product` create/update payload.** Fewest round-trips, but conflates two edit surfaces and makes `PATCH /products/:id` ambiguous (does omitting `recipeIt
ems` mean "unchanged" or "delete all"?).

---

## 4. Proposed Prisma schema additions — ⚠️ approval gate, not applied

Migration name: `add_master_data_products_recipes_raw_materials`.

```prisma
/// OhMyPos — ERD §3. Stock lives here and nowhere else (ADR-004).
model RawMaterial {
  id String @id @default(uuid())

  name String @unique
  /// satuan — kg, liter, pcs. Free text (ERD §3), not an enum.
  unit String

  /// Current cost per unit. Editing this changes every dependent product's
  /// live HPP by design (ADR-005), and never rewrites history (SaleItem.hppAtSale).
  unitCost Decimal @map("unit_cost") @db.Decimal(18, 2)

  /// Denormalized running balance, only ever written inside the same transaction
  /// as the StockMovement that justifies it, under FOR UPDATE (ADR-007, ERD §6).
  /// NOT writable through this module's CRUD — see decision (b).
  currentStock Decimal @default(0) @map("current_stock") @db.Decimal(18, 4)

  lowStockThreshold Decimal @default(0) @map("low_stock_threshold") @db.Decimal(18, 4)

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  recipeItems RecipeItem[]

  @@map("raw_materials")
}

/// OhMyPos — ERD §3. No `hpp` column: HPP is computed live from RecipeItem +
/// RawMaterial.unitCost (ADR-005), and no stock column: makeable quantity is
/// derived, never stored (ADR-013).
model Product {
  id String @id @default(uuid())

  name      String  @unique
  sellPrice Decimal @map("sell_price") @db.Decimal(18, 2)
  isActive  Boolean @default(true) @map("is_active")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  recipeItems RecipeItem[]

  @@map("products")
}

/// OhMyPos — bill of materials (ERD §3). The product's recipe is this set of
/// rows; there is deliberately no separate Recipe table.
model RecipeItem {
  id String @id @default(uuid())

  productId     String @map("product_id")
  rawMaterialId String @map("raw_material_id")

  quantityUsed Decimal @map("quantity_used") @db.Decimal(18, 4)

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  // Cascade: a recipe has no meaning without its product.
  product     Product     @relation(fields: [productId], references: [id], onDelete: Cascade)
  // Restrict: deleting a raw material still used by a recipe must fail loudly,
  // not silently empty out a product's cost basis.
  rawMaterial RawMaterial @relation(fields: [rawMaterialId], references: [id], onDelete: Restrict)

  @@unique([productId, rawMaterialId])
  @@index([productId])
  @@index([rawMaterialId])
  @@map("recipe_items")
}
```

Three points above are decisions, not transcription:

**(a) `@unique` on `Product.name` and `RawMaterial.name`** — *approved*. The ERD does not specify it, but `Category` and `Branch` both have it, and two raw materials called "Gula" with
different `unitCost` is a costing bug waiting to happen.

**(b) `currentStock` is not writable through this module** — *approved*. It is excluded from the create and update Zod schemas entirely; the only legitimate way it changes is a `StockMo
vement` under `FOR UPDATE` (ADR-007), and a CRUD endpoint that set it directly would be a hole straight through ERD §6. Initial stock arrives in Phase 4 via `OpeningStock`. (`lowStockTh
reshold` **is** writable — it is a setting, not a balance.)

**(c) `onDelete` asymmetry** between `Product` (Cascade) and `RawMaterial` (Restrict), for the reasons in the comments.

---

## 5. Zod contracts — `packages/api-contracts`

Three new files mirroring `account.schema.ts` exactly (create schema → `.partial()` for update → response schema), all exported from `index.ts`:

| File | Exports |
|---|---|
| `raw-material.schema.ts` | `CreateRawMaterialSchema`, `UpdateRawMaterialSchema`, `RawMaterialResponseSchema` |
| `product.schema.ts` | `CreateProductSchema`, `UpdateProductSchema`, `ProductResponseSchema`, `ProductWithHppResponseSchema` |
| `recipe.schema.ts` | `RecipeItemInputSchema`, `ReplaceRecipeSchema`, `RecipeItemResponseSchema`, `RecipeResponseSchema`, `RecipeEnvelopeResponseSchema` (imports `ProductWithHppResponseSchema` from `product.schema.ts`) |

Decimal discipline per Playbook §5 — the scale-enforcing primitives already exist:

- `unitCost`, `sellPrice`, `hpp` → `MoneyString` (18,2)
- `quantityUsed`, `lowStockThreshold`, `currentStock` (response only) → `QuantityString` (18,4)
- `quantityUsed` additionally `.refine(v => Number(v) > 0)` — a zero-quantity recipe line is meaningless and breaks the makeable-quantity `min`
- `makeableQuantity` → `z.number().int().nullable()` (a whole-unit count, not a decimal quantity)
- **No `z.number()` anywhere for money or quantity. No `any`.**

`ProductWithHppResponseSchema` carries `hpp: MoneyString.nullable()`, `hasRecipe: boolean`, `makeableQuantity: number | null`, `margin: MoneyString.nullable()` (`sellPrice − hpp`).

---

## 6. Module / file list and guard placement

This list is **exhaustive and reconciled with §9** — create exactly these files, no more. Every
existing module in the repo is exactly `X.controller.ts` / `X.dto.ts` / `X.module.ts` /
`X.service.ts` (plus `X.exceptions.ts` in `users`), and `matching-engine.ts` +
`matching-engine.spec.ts` is the existing precedent for a non-suffixed helper file living
inside a module — which is what `hpp.calculator.ts` and `products.mapper.ts` are.

```
apps/api/src/modules/raw-materials/
  raw-materials.controller.ts     RoleGuard: writes OWNER+ADMIN, reads any authenticated (§9.6)
  raw-materials.service.ts        CRUD + private toResponse() (§9.3)
  raw-materials.module.ts
  raw-materials.dto.ts            createZodDto wrappers only
  raw-materials.exceptions.ts     RawMaterialNameTakenException, RawMaterialInUseException

apps/api/src/modules/products/
  products.controller.ts          + recipe sub-routes (PUT/GET /products/:id/recipe), delegating to RecipesService
  products.service.ts             CRUD; always loads recipeItems.rawMaterial, always returns via the mapper
  products.module.ts              imports RecipesModule
  products.dto.ts
  products.exceptions.ts          ProductNameTakenException — and nothing else, see below
  hpp.calculator.ts               ← pure function, no Prisma, no Nest. The correctness core (§9.2).
  hpp.calculator.spec.ts
  products.mapper.ts              ← the only place hpp/margin/makeableQuantity/hasRecipe are attached (§9.3)

apps/api/src/modules/recipes/
  recipes.service.ts              full-replace inside $transaction (§9.5) + getRecipe (§9.7a)
  recipes.module.ts               exports RecipesService
  recipes.dto.ts                  ReplaceRecipeDto
  recipes.exceptions.ts           UnknownRawMaterialException — and nothing else, see below
```

**Exception inventory — exactly four classes, each with exactly one trigger.** Create no others,
and never reuse one module's exception in another. The repo's only precedent is
`EmailAlreadyRegisteredException` (`users.exceptions.ts`): domain-specific, owned by its module,
naming the rule broken at the throw site (Playbook §6). There is deliberately **no** generic
`DuplicateNameException` and no shared `common/` exception file for four classes.

| Class | File | Trigger |
|---|---|---|
| `RawMaterialNameTakenException` | `raw-materials.exceptions.ts` | `P2002` on `RawMaterial.name` |
| `RawMaterialInUseException` | `raw-materials.exceptions.ts` | `P2003` deleting a raw material a recipe still references |
| `ProductNameTakenException` | `products.exceptions.ts` | `P2002` on `Product.name` |
| `UnknownRawMaterialException` | `recipes.exceptions.ts` | a `rawMaterialId` in a replace payload that does not exist |

Three exception names from earlier drafts are **deliberately not created** — each would be dead
code inviting a wrong throw site:

- `RecipeIncompleteException` — belongs to the **Phase 5** sale flow (§2, rule 2). A Phase 3
  read endpoint must never throw it.
- `ProductInUseException` — has no trigger at all: `onDelete: Cascade` (§4) means deleting a
  product is never blocked.
- `DuplicateRecipeItemException` — duplicates within one payload are rejected by
  `ReplaceRecipeSchema.superRefine` before the request reaches the service (§9.4, §9.5). A
  service-layer check would shadow the Zod one and drift from it.

**Module wiring — one direction only.** `RecipesModule` puts `RecipesService` in its `exports`;
`ProductsModule` lists `RecipesModule` in its `imports`, because the recipe routes live on
`ProductsController` (§3, R1). **Never the reverse.** `recipes.service.ts` imports
`products.mapper.ts` as a plain file — a pure function, not a provider — so no Nest dependency
cycle exists and **`forwardRef` must not appear anywhere in this phase**; reaching for it means
the wiring is wrong.

Plus: register all three modules in `app.module.ts`; extend `prisma/seed.ts` with synthetic raw materials, products and recipes (needed to exercise Phase 5's POS at all, and to verify H
PP by hand).

### Guard placement — explicit, per Playbook §8

| Endpoint | Guard | Roles |
|---|---|---|
| `POST` / `PATCH` / `DELETE /raw-materials` | `RoleGuard` | `OWNER`, `ADMIN` |
| `GET /raw-materials`, `GET /raw-materials/:id` | global `JwtAuthGuard` only | any authenticated — KASIR needs read for Phase 5/8 |
| `POST` / `PATCH` / `DELETE /products` | `RoleGuard` | `OWNER`, `ADMIN` |
| `GET /products`, `GET /products/:id` | global `JwtAuthGuard` only | any authenticated |
| `PUT /products/:id/recipe` | `RoleGuard` | `OWNER`, `ADMIN` |
| `GET /products/:id/recipe` | global `JwtAuthGuard` only | any authenticated |

**No `BranchScopeGuard` anywhere in this module, deliberately.** None of these three tables has a `branchId` — stock and master data are centralized (ADR-004), so there is nothing to sc
ope. This is noted in the code so its absence does not read as the oversight TASK-004's handoff warned about.

Because reads and writes differ, `@UseGuards(RoleGuard)` sits at controller level with `@Roles(...)` per write method. The guard passes through when no `@Roles` is present, so a method
added later without `@Roles` defaults to authenticated-but-unrestricted — correct for reads, and a self-review checklist item for writes.

> **Observation, out of scope, no action taken:** `AccountsController`, `CategoriesController` and `BranchesController` from Phase 1 carry no `RoleGuard` at all — a `KASIR` can currentl
y create and delete accounts and branches. ADR-011 §4 only names user creation and allocation as hard restrictions, so this is not a violation on paper, but it is inconsistent with the
master-data rule above. Suggested: log as a tech-debt entry rather than fix it here (strict scope).

---

## 7. Test plan (Playbook §10)

Master-data CRUD is "should have" tier. **The HPP calculation is not** — every Dashboard 3 report and the Phase 5 `Sale` flow depend on it.

### Tier 1 — `hpp.calculator.spec.ts`, exhaustive unit tests (pure function, no database)

- Single item, exact arithmetic: `2.5000 kg × 12000.00 = 30000.00`
- Multiple items summed
- **Rounding proof:** items that individually round differently than the sum does — asserts round-once-at-the-end, `HALF_UP`
- **Zero-cost raw material** (`unitCost = 0`) → contributes `0`, does not null the result, does not throw
- **Missing recipe** (empty item list) → `null`, **not `0`**, with an explicit assertion that it is not `"0"` — that is the bug that would silently report infinite margin
- Full 4dp quantities × 2dp costs at 18-digit precision boundaries → no float contamination (assert the result is a `Decimal`, and assert a value a `number` would mangle)
- Negative / absent inputs → guarded

### Tier 1 — makeable-quantity unit tests

Floor behaviour; `min` across items; `null` on no recipe; zero `currentStock` → `0`; one binding constraint among many; `quantityUsed = 0` excluded.

### Tier 2 — service integration tests (real Postgres, following `allocation-sum.e2e-spec.ts`'s pattern)

- **Recipe changes after products exist** — create product + recipe, read HPP, edit `RawMaterial.unitCost`, read again → HPP moved, and nothing was written to `products`
- Full-replace recipe: add/remove/change rows in one call; no intermediate state observable; `unique(productId, rawMaterialId)` holds
- Duplicate raw material in one replace payload → rejected before any write
- Delete a raw material referenced by a recipe → blocked (`Restrict`), surfacing the domain exception, not a raw Prisma error
- Delete a product → its recipe items cascade, raw materials survive untouched
- `currentStock` supplied in a create/update payload → rejected by Zod, column unchanged

### Tier 3 — e2e (`master-data.e2e-spec.ts`), auth-aware per TASK-004's handoff (every request logs in first)

- `KASIR` `GET` products/raw-materials → 200; `KASIR` `POST`/`PATCH`/`DELETE` → 403
- `ADMIN` and `OWNER` writes → 201/200
- Unauthenticated → 401 (no unguarded path remains)
- Product response carries `hpp`, `hasRecipe`, `makeableQuantity` in the documented shape
- Over-precise decimals rejected at the edge (3dp money, 5dp quantity)
- Money fields come back with their scale intact — assert `sellPrice` and `hpp` literally equal
  `"4530.00"`-style strings, never just "is defined". This is the §9.3 `toJSON()` trap, and a
  loose assertion is exactly what lets it through
- `GET /products/:id/recipe` on a product with no recipe → 200 with `items: []`, `hpp: null`,
  `hasRecipe: false` — not 404, not 400 (§9.7a)
- `PUT` and `GET /products/:id/recipe` return byte-identical envelopes for the same state

---

## 8. Sequencing, gates, and scope boundary

1. Write **ADR-013**; correct `DESIGN.md`'s moving-average copy; mark **DEBT-005 Resolved** with the resolution recorded.
2. **Schema + migration** — ⚠️ *gate: explicit go-ahead required before touching `schema.prisma`*.
3. Zod contracts in `packages/api-contracts`.
4. `hpp.calculator.ts` + its unit tests — **before** any service code. Everything else depends on it being right.
5. `raw-materials` module → `recipes` → `products` (dependency order).
6. Seed data.
7. `turbo run lint typecheck test build` + e2e, green locally.
8. Log the work in `07 - Task_Log.md` (and `06 - Error_Log.md` / `08 - Tech_Debt_Log.md` if anything arises), per AGENTS.md §6.

### Open gates

- [ ] **Recipe API shape** — confirm **R1** (recommended) or pick R2 / R3.
- [ ] **Migration go-ahead** — the *content* of §4 is approved; writing the models and running `pnpm --filter api prisma migrate dev --name add_master_data_products_recipes_raw_material
s` still needs an explicit "go" per AGENTS.md.

### Explicitly out of scope

The `apps/web` master-data UI (`app/(back-office)/master-data/page.tsx` stays the Phase 2 placeholder); `Supplier`, `SupplierPurchase`, `StockMovement`, `OpeningStock` (Phase 4); the `S
ale` flow and `hppAtSale` snapshot (Phase 5); the Phase 1 guard inconsistency noted in §6; DEBT-004's tax/discount/SKU questions.

**No new dependencies required** — `decimal.js` and everything else needed is already installed.

---

## 9. Executable spec (for the implementer)

§1–§8 record *decisions*; a reader who cannot infer this repo's house style from its existing
code still has room to build something that compiles, passes its own tests, and is still wrong.
This section closes that room. It changes nothing decided above — no new schema, no new
scope — it just makes the mechanics literal instead of implied.

### 9.0 Pre-flight — an earlier attempt was rolled back; the tree has been cleaned

An earlier attempt at this phase was discarded via "discard changes," which reverted the
tracked files but left build artifacts and empty directories behind. **This has now been
cleaned (2026-08-15) — the list is kept here as the record of what was wrong and how the
baseline was proven, not as work still to do.**

What was left behind, and why `git status` showed none of it:

- `apps/api/prisma/migrations/20260815061801_add_master_data_products_recipes_raw_materials/` —
  present but **empty** (the `migration.sql` had been deleted). Git does not track empty
  directories, so it was invisible.
- Empty module directories `apps/api/src/modules/{products,recipes,raw-materials}/` — same
  reason.
- `apps/api/src/generated/prisma/models/` still held **`Product.ts`, `RawMaterial.ts`,
  `RecipeItem.ts`** from the rolled-back schema. Gitignored, therefore invisible.
- `apps/api/dist/modules/{products,recipes,raw-materials}/` (including a compiled
  `hpp.calculator.js`) and `packages/api-contracts/dist/{product,recipe,raw-material}.schema.js`
  — compiled output of the discarded implementation. Gitignored.
- `apps/web/.next/` bundles still contained `RawMaterialResponseSchema`, `RecipeItemInputSchema`
  and friends, baked in from a build made while those contracts existed.

Why this mattered more than tidiness: **`this.prisma.product.findMany()` typechecked.** The
stale generated types satisfied the compiler, so `turbo run typecheck` passed while the query
would fail at runtime against a database with no `products` table — precisely the
compiles-but-wrong class this section exists to prevent.

Cleanup performed: empty directories removed; `apps/api/dist`, `packages/api-contracts/dist`,
`apps/web/.next` and the api/api-contracts/web `.turbo` caches deleted; Prisma client
regenerated from the current schema (`models/` now holds exactly the seven models
`schema.prisma` declares). Baseline verified green: `pnpm turbo run build lint typecheck test`
— 13/13 tasks pass, `git status` clean apart from this document.

**One item is still open** and must be done before step 2 of §8's sequence — the database was
checked once Docker came up, and it *is* drifted:

- `_prisma_migrations` still records `20260815061801_add_master_data_products_recipes_raw_materials`
  as applied, although the migration file no longer exists.
- The tables `products`, `raw_materials` and `recipe_items` are **still present in the database**
  (empty, 0 rows), created by that vanished migration and declared nowhere in `schema.prisma`.
- Confirmed with `prisma migrate diff --from-schema prisma/schema.prisma --to-config-datasource
  --script`, which emits `CREATE TABLE` for all three — i.e. the live database is ahead of the
  schema.

⚠️ **`prisma migrate status` does not catch this.** It reports *"2 migrations found … Database
schema is up to date!"* — it compares migration filenames against applied names and does not
run drift detection, so it reads green on a drifted database. Do not use it as the pre-flight
check; use `migrate diff` as above.

- [ ] Reset the dev database so its history matches the two tracked migrations, then reseed:
      `pnpm --filter api exec prisma migrate reset --force` followed by
      `pnpm --filter api db:seed`. Safe: every table is empty except `users` (5 synthetic
      `@ohmypos.local` accounts the seed recreates). The reset also repairs a second existing
      inconsistency — `branches` currently has 0 rows while `KASIR` users exist, which ADR-011 §2
      forbids; the seed restores branches and reattaches the cashier to one.

An unrelated pre-existing quirk, noticed during cleanup and deliberately left alone:
`apps/web/next-env.d.ts` is committed in its `next dev` form (`./.next/dev/types/…`), but
`next build` and `next typegen` rewrite it to `./.next/types/…`. Any `turbo run typecheck` or
`build` therefore dirties a tracked file. Not caused by this phase and not fixed here —
candidate for `08 - Tech_Debt_Log.md`.

### 9.1 Non-negotiables

- **Never `.toNumber()` or `Number(...)` on a value that reaches a response.** `Prisma.Decimal`
  crosses the boundary as a string by design (Playbook §5); converting to a JS number
  reintroduces the float-precision bug the whole `Decimal` discipline exists to prevent.
- **Never `z.number()` for money or quantity anywhere**, including new response fields not
  covered by an existing primitive (`makeableQuantity` is the one legitimate exception — see 9.3).
- **Never call `Decimal.set(...)`.** It mutates global rounding config and would silently change
  `MatchingEngine`'s and `AllocationService`'s arithmetic. Round with an explicit call —
  `.toDecimalPlaces(scale, Prisma.Decimal.ROUND_HALF_UP)` — never a global default.
- **Round exactly once, at the end of `calculateHpp`.** Never round a per-line-item subtotal.
- **No `any`**, per AGENTS.md §8, no exceptions.

### 9.1a Comment convention — this is what makes the code look like Phase 0–2

Code can satisfy every rule in this section and still not belong in this repo, because Phase 0–2
carries a specific texture: **every non-obvious decision is commented with its source.** That is
not decoration — it is how a later reader tells a deliberate choice from an accident. Match it.

Read these three files and imitate their commenting density before writing anything:
`apps/api/src/common/guards/role.guard.ts`, `packages/api-contracts/src/primitives.ts`,
`apps/api/src/modules/users/users.service.ts`.

The four rules they follow:

1. **Every file opens with a doc comment** saying what the file is and citing the rule that
   governs it — `(ADR-005)`, `(Playbook §8)`, `(ERD §6)`, `(ADR-011 §2)`. See the header of
   `role.guard.ts`.
2. **Comments explain *why*, never *what*.** `// Round once, HALF_UP — rounding per line item
   would make HPP depend on how the recipe was split into rows` is right;
   `// round the total` is noise. If a comment restates the syntax, delete it.
3. **A deliberate omission is commented as deliberate.** The absent `BranchScopeGuard` (§6), the
   absent pagination (§9.7), the absent `RecipeIncompleteException` (§6) — each gets one line
   saying it is a decision, so nobody later "fixes" it. `users.service.ts`'s note on why
   `tokenValidFrom` is set from the application clock is the model.
4. **Cite the trap where the trap is.** The `tx`-not-`this.prisma` warning (§9.5) and the
   `.toFixed()` scale rule (§9.3) belong as comments at those exact lines in the shipped code,
   not only in this document — this document is not in the repo, the code is.

A file whose only comments are the ones copied from §9's snippets has not met this rule.

### 9.2 `hpp.calculator.ts` — literal signature

```ts
import { Prisma } from '../../generated/prisma/client';

export interface HppLineInput {
  quantityUsed: Prisma.Decimal;
  unitCost: Prisma.Decimal;
}

/**
 * Pure — no Prisma calls, no Nest DI. Phase 5 imports this exact function for
 * SaleItem.hppAtSale (ADR-005); the live figure and the snapshot must never
 * be two implementations that can drift.
 *
 * Returns null when items is empty — "no recipe" is a different fact than
 * "recipe costs nothing," and callers must not treat null as 0.
 */
export function calculateHpp(items: HppLineInput[]): Prisma.Decimal | null {
  if (items.length === 0) return null;

  const total = items.reduce(
    (sum, item) => sum.plus(item.quantityUsed.times(item.unitCost)),
    new Prisma.Decimal(0),
  );

  // Round once, HALF_UP, to 2dp — never round each line item first.
  return total.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}
```

Import `Decimal` via `Prisma.Decimal` from `../../generated/prisma/client` (same module
`accounts.service.ts` uses), never `import Decimal from 'decimal.js'` directly — two different
`Decimal` classes must never end up compared or mixed in the same codebase.

### 9.3 Response mapping — and a verified serialization trap

**The repo has two competing precedents here, and the implementer must follow the second one.**
`accounts.service.ts` returns Prisma models raw; `users.service.ts` maps every result through a
private `toResponse()` before returning it (`users.service.ts:53, 67, 75, 82`). Copying the
`accounts` pattern into Phase 3 would be wrong, for a reason that is not obvious:

`Prisma.Decimal` does serialize to a string automatically via its own `toJSON()`, **but that
`toJSON()` does not preserve scale** — verified directly against this repo's installed Prisma
runtime:

```
new Prisma.Decimal('4530.00').toJSON()  →  "4530"     // NOT "4530.00"
new Prisma.Decimal('0.00').toJSON()     →  "0"
```

This already affects `Account.openingBalance` today (pre-existing, out of this plan's scope —
worth its own tech-debt line, not a Phase 3 fix). For Phase 3's *new* money fields it must not
be inherited silently, because §9.8's seed fixture and e2e tests assert exact strings like
`"4530.00"`. Rule: **any field typed `MoneyString`/`QuantityString` in a response must be
serialized with an explicit `.toFixed(scale)`, never left to implicit `toJSON()`.**

Concretely, one small mapper, used by both the list and the detail endpoint — the only place
`hpp`/`margin`/`makeableQuantity`/`hasRecipe` get attached, so the shape can't drift between
the two routes:

```ts
// apps/api/src/modules/products/products.mapper.ts
import { Prisma } from '../../generated/prisma/client';
import { calculateHpp } from './hpp.calculator';
import type { ProductWithHppResponse } from '@ohmypos/api-contracts';

type ProductWithRecipe = Prisma.ProductGetPayload<{
  include: { recipeItems: { include: { rawMaterial: true } } };
}>;

export function toProductWithHppResponse(
  product: ProductWithRecipe,
): ProductWithHppResponse {
  const hpp = calculateHpp(
    product.recipeItems.map((ri) => ({
      quantityUsed: ri.quantityUsed,
      unitCost: ri.rawMaterial.unitCost,
    })),
  );
  const hasRecipe = product.recipeItems.length > 0;

  return {
    id: product.id,
    name: product.name,
    sellPrice: product.sellPrice.toFixed(2),
    isActive: product.isActive,
    hpp: hpp ? hpp.toFixed(2) : null,
    hasRecipe,
    margin: hpp ? product.sellPrice.minus(hpp).toFixed(2) : null,
    makeableQuantity: hasRecipe ? computeMakeableQuantity(product.recipeItems) : null,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

function computeMakeableQuantity(
  items: ProductWithRecipe['recipeItems'],
): number | null {
  const usable = items.filter((ri) => ri.quantityUsed.greaterThan(0));
  if (usable.length === 0) return null;
  const perItem = usable.map((ri) =>
    ri.rawMaterial.currentStock.dividedBy(ri.quantityUsed).floor(),
  );
  return Prisma.Decimal.min(...perItem).toNumber(); // whole-unit count — the one legitimate `number`
}
```

**Every one of the three new modules returns mapped responses — none returns a raw Prisma
model.** `RawMaterialResponseSchema` (`unitCost`, `currentStock`, `lowStockThreshold`) and the
plain `ProductResponseSchema` need the same `.toFixed(scale)` treatment; there is no shortcut
that skips this for the simpler endpoints. `raw-materials.service.ts` gets a private
`toResponse()` exactly like `users.service.ts`; `products` gets the standalone
`products.mapper.ts` above because both the products service and the recipes service need it.

### 9.4 Error mapping — mechanism, not just exception name

| Situation | Mechanism | Exception |
|---|---|---|
| Duplicate `RawMaterial.name` | attempt the write, catch `Prisma.PrismaClientKnownRequestError` with `error.code === 'P2002'` (pattern already in `users.service.ts:54-59`) | `RawMaterialNameTakenException` (`ConflictException`, Playbook §6) |
| Duplicate `Product.name` | same `P2002` catch | `ProductNameTakenException` (`ConflictException`) |
| Delete a `RawMaterial` still referenced by a `RecipeItem` | attempt the delete, catch `error.code === 'P2003'` | `RawMaterialInUseException` |
| Unknown `rawMaterialId` inside a recipe replace payload | inside the same `$transaction`: `findMany({ where: { id: { in: ids } } })` and set-compare against the payload — **not** a pre-check outside the transaction | `UnknownRawMaterialException` |
| Duplicate `rawMaterialId` within one replace payload | `ReplaceRecipeSchema` `.superRefine()` — rejected by Zod before the request reaches the service | 400, no exception needed |
| `Product`/`RawMaterial` not found by id | `findUnique` + `NotFoundException`, exactly `accounts.service.ts`'s pattern | — |

No pre-check `findUnique`-then-`create` pattern anywhere in this module — that shape is a
TOCTOU race under concurrent requests; catching the DB constraint is both simpler and correct.

### 9.5 Recipe full-replace — the atomicity skeleton

R1's entire justification (§3) is that no half-old/half-new recipe can ever be observed as a
wrong live HPP. That guarantee lives or dies on one detail, and it is the single easiest thing
in this phase to get wrong in a way that still passes every test:

```ts
// recipes.service.ts
async replaceRecipe(productId: string, dto: ReplaceRecipe) {
  return this.prisma.$transaction(async (tx) => {
    // ⚠️ Every call inside this callback uses `tx`, never `this.prisma`.
    // `this.prisma.x` here would silently run on a separate connection,
    // OUTSIDE the transaction — it typechecks, it passes a happy-path test,
    // and it quietly destroys the atomicity this endpoint exists to provide.

    const product = await tx.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException(`Product with ID ${productId} not found`);

    const ids = dto.items.map((i) => i.rawMaterialId);
    const found = await tx.rawMaterial.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    if (found.length !== ids.length) {
      const known = new Set(found.map((r) => r.id));
      throw new UnknownRawMaterialException(ids.filter((id) => !known.has(id)));
    }

    await tx.recipeItem.deleteMany({ where: { productId } });
    if (dto.items.length > 0) {
      await tx.recipeItem.createMany({
        data: dto.items.map((i) => ({
          productId,
          rawMaterialId: i.rawMaterialId,
          quantityUsed: new Prisma.Decimal(i.quantityUsed),
        })),
      });
    }

    const updated = await tx.product.findUniqueOrThrow({
      where: { id: productId },
      include: { recipeItems: { include: { rawMaterial: true } } },
    });
    // Both recipe endpoints return this exact shape — see §9.7a.
    return toRecipeEnvelope(updated);
  });
}
```

`deleteMany` then `createMany` (rather than a per-row diff) is deliberate: it is the shape that
makes `@@unique([productId, rawMaterialId])` trivially satisfiable, and inside a transaction it
is indistinguishable from a diff to any observer. The empty-array case still runs the
`deleteMany` — that is what "clear the recipe" means (§9.7).

`ReplaceRecipeSchema`, written out because the `superRefine` is the part most likely to be
skipped or written as a runtime check in the service instead:

```ts
// packages/api-contracts/src/recipe.schema.ts
export const RecipeItemInputSchema = z.object({
  rawMaterialId: UuidString,
  // Strictly positive: a zero-quantity line is meaningless and would break the
  // makeable-quantity `min` with a divide-by-zero (ADR-013).
  quantityUsed: QuantityString.refine((v) => Number(v) > 0, 'must be greater than zero'),
});

export const ReplaceRecipeSchema = z.object({
  // Empty array is legal and means "clear this product's recipe" (§9.7).
  items: z.array(RecipeItemInputSchema).superRefine((items, ctx) => {
    const seen = new Set<string>();
    for (const [index, item] of items.entries()) {
      if (seen.has(item.rawMaterialId)) {
        ctx.addIssue({
          code: 'custom',
          path: [index, 'rawMaterialId'],
          message: 'duplicate rawMaterialId in the same recipe',
        });
      }
      seen.add(item.rawMaterialId);
    }
  }),
});
```

### 9.6 Controller skeleton — guard placement made literal

```ts
// raw-materials.controller.ts
@ApiTags('raw-materials')
@Controller('raw-materials')
@UseGuards(RoleGuard) // applied once; reads pass through because they carry no @Roles (Playbook §8)
export class RawMaterialsController {
  constructor(private readonly service: RawMaterialsService) {}

  @Post()
  @Roles('OWNER', 'ADMIN')
  create(@Body() dto: CreateRawMaterialDto) { /* ... */ }

  @Get()
  findAll() { /* no @Roles — any authenticated role, incl. KASIR (Phase 5/8 read) */ }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) { /* no @Roles */ }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRawMaterialDto) { /* ... */ }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN')
  remove(@Param('id', ParseUUIDPipe) id: string) { /* ... */ }
}
```

The one wiring mistake this must not become: putting `@Roles('OWNER', 'ADMIN')` on the
`@Controller()` class decorator itself (as `UsersController` correctly does for an OWNER-only
resource) — here that would lock `KASIR` out of `GET`, breaking the Phase 5 POS product/stock
read. `@UseGuards(RoleGuard)` goes on the class; `@Roles(...)` goes only on write methods.
Same shape for `ProductsController`, plus its two recipe sub-routes
(`PUT`/`GET /products/:id/recipe`) per the table in §6.

### 9.7 Settled mechanical decisions

- `GET /products`, `GET /raw-materials`: **not paginated** in Phase 3 — matches
  `accounts.findAll()` (`orderBy: { name: 'asc' }`, no `PaginationQuerySchema`). Revisit in
  Phase 8 if list size warrants it; note this in the code so it reads as a choice, not a gap.
- `ReplaceRecipeSchema` accepts `items: []`: legal, means "clear the recipe." The product then
  reads back `hpp: null, hasRecipe: false, makeableQuantity: null`.
- `PUT` and `GET /products/:id/recipe` return the **same** envelope — `{ recipe, product }`,
  defined literally in §9.7a — so the caller never needs a follow-up request and the two routes
  can never drift apart.

### 9.7a The two recipe endpoints — response shape and `getRecipe`

§5 names `RecipeItemResponseSchema` and `RecipeResponseSchema` without defining them. Here they
are, along with the single envelope both routes return. Nothing about this shape is left to
choose:

```ts
// packages/api-contracts/src/recipe.schema.ts (continued from §9.5)

export const RecipeItemResponseSchema = z.object({
  id: UuidString,
  rawMaterialId: UuidString,
  /// Denormalised for display so the client needs no second lookup to render a row.
  rawMaterialName: z.string(),
  unit: z.string(),
  quantityUsed: QuantityString,
  unitCost: MoneyString,
  /// quantityUsed × unitCost, rounded to 2dp for display only — see the warning below.
  lineCost: MoneyString,
});

export const RecipeResponseSchema = z.object({
  productId: UuidString,
  items: z.array(RecipeItemResponseSchema),
  hpp: MoneyString.nullable(),
  hasRecipe: z.boolean(),
});

/// The single body returned by BOTH `PUT` and `GET /products/:id/recipe`.
export const RecipeEnvelopeResponseSchema = z.object({
  recipe: RecipeResponseSchema,
  product: ProductWithHppResponseSchema,
});
```

⚠️ **`lineCost` is a display value and is never a cost source.** It is rounded per line, so the
sum of the `lineCost`s can differ from `recipe.hpp` by a cent — that is expected and correct,
because `hpp` rounds once at the end (§9.1). Never sum `lineCost` to obtain HPP, in this phase
or in Phase 5; `calculateHpp` stays the only cost implementation. Add exactly that warning as a
comment where `lineCost` is computed.

Both the envelope builder and `getRecipe` live in the same two files as everything else:

```ts
// products.mapper.ts — alongside toProductWithHppResponse
export function toRecipeEnvelope(product: ProductWithRecipe): RecipeEnvelopeResponse {
  const productResponse = toProductWithHppResponse(product);
  return {
    recipe: {
      productId: product.id,
      items: product.recipeItems.map((ri) => ({
        id: ri.id,
        rawMaterialId: ri.rawMaterialId,
        rawMaterialName: ri.rawMaterial.name,
        unit: ri.rawMaterial.unit,
        quantityUsed: ri.quantityUsed.toFixed(4),
        unitCost: ri.rawMaterial.unitCost.toFixed(2),
        // Display only — never summed to produce HPP (see the warning in §9.7a).
        lineCost: ri.quantityUsed
          .times(ri.rawMaterial.unitCost)
          .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
          .toFixed(2),
      })),
      hpp: productResponse.hpp,
      hasRecipe: productResponse.hasRecipe,
    },
    product: productResponse,
  };
}

// recipes.service.ts — no transaction needed, this is a pure read
async getRecipe(productId: string): Promise<RecipeEnvelopeResponse> {
  const product = await this.prisma.product.findUnique({
    where: { id: productId },
    include: { recipeItems: { include: { rawMaterial: true } } },
  });
  if (!product) throw new NotFoundException(`Product with ID ${productId} not found`);
  return toRecipeEnvelope(product);
}
```

A product with no recipe returns `items: []`, `hpp: null`, `hasRecipe: false` — a 200, never a
404 and never a 400. Absence of a recipe is a valid state (§2, rule 2), not an error.

Export `RecipeEnvelopeResponseSchema` from `packages/api-contracts/src/index.ts` with the rest.

### 9.8 Seed fixture — hand-checkable numbers

Extend `prisma/seed.ts` with fixed, pre-computed values so §7's "verify by hand" is
actually executable, and the same numbers back the e2e assertions:

| Raw material | unit | unitCost |
|---|---|---|
| Gula | kg | 12000.00 |
| Kopi | kg | 85000.00 |

Product **Es Kopi Susu**: `0.2500 kg` Gula + `0.0180 kg` Kopi.

```
0.2500 × 12000.00 = 3000.00
0.0180 ×  85000.00 = 1530.00
                    -------
              HPP = 4530.00
```

Add one product with **no** recipe (e.g. "Air Mineral") to exercise `hpp: null` in the seed
data too — every fixture set needs at least one null-path case, not only the happy path.

### 9.9 Definition of done

Before the implementer reports Phase 3 complete, all of the following must hold:

- [ ] §9.0's one remaining pre-flight item was done: `_prisma_migrations` checked against the
      running dev database, and reset if it still carries the deleted `20260815061801_…` row
- [ ] `turbo run lint typecheck test build` green
- [ ] `pnpm --filter api test:e2e` green
- [ ] No `this.prisma.` call appears inside any `$transaction` callback (§9.5). Note: §9.7a later
      added a plain (non-transactional) `getRecipe()` read to the same file, so the naive grep
      `grep -n "this.prisma" recipes.service.ts` now also matches that legitimate read — check
      instead that no `this.prisma` appears **between** the `$transaction(async (tx) => {` line
      and its closing `});`
- [ ] No new endpoint returns a raw Prisma model; every money/quantity field went through
      `.toFixed(scale)` (§9.3)
- [ ] `grep -rn "toNumber()\|z.number()\|: any" apps/api/src/modules/{raw-materials,recipes,products} packages/api-contracts/src/{raw-material,recipe,product}.schema.ts` returns only the one sanctioned `makeableQuantity` `.toNumber()` in `products.mapper.ts`
- [ ] Exactly the four exceptions in §6's inventory exist, no more:
      `grep -rn "RecipeIncompleteException\|ProductInUseException\|DuplicateRecipeItemException\|DuplicateNameException" apps/api/src`
      returns nothing
- [ ] `grep -rn "forwardRef" apps/api/src/modules` returns nothing (§6, module wiring)
- [ ] Every new `.ts` file opens with a doc comment containing an `ADR-` or `§` citation
      (§9.1a); no file's comments are merely the ones copied from this document
- [ ] `GET` and `PUT /products/:id/recipe` return the identical `{ recipe, product }` envelope —
      asserted in the e2e test by comparing both bodies, not just spot-checking fields
- [ ] `lineCost` is nowhere summed to derive a cost:
      `grep -rn "lineCost" apps/api/src` shows it only being written in `products.mapper.ts`
- [ ] All three modules registered in `apps/api/src/app.module.ts`
- [ ] All three schema files exported from `packages/api-contracts/src/index.ts`
- [ ] ADR-013 written; `DESIGN.md`'s moving-average copy corrected; DEBT-005 marked Resolved
- [ ] `docs/07 - Task_Log.md` updated per AGENTS.md §6
- [ ] The e2e test asserts the seed's `"4530.00"` HPP string literally, not just "is truthy"