# Products & Recipes

**Owner module for:** `Product`, `RecipeItem` (through `RecipesService`), live HPP
**Related:** ERD §3 · ADR-004, ADR-005, ADR-010, ADR-011, ADR-013, ADR-024 · ERR-004

## Overview

Products are centralized master data with no `branchId`, so these endpoints have **no `BranchScopeGuard`**. Writes are `OWNER`/`ADMIN`. Reads are open to every authenticated role, including `KASIR`, because the POS reads products and recipes.

| Endpoint | Roles |
|---|---|
| `POST /products`, `PATCH /products/:id`, `DELETE /products/:id` | `OWNER`, `ADMIN` |
| `POST /products/:id/photo` | `OWNER`, `ADMIN` |
| `GET /products`, `GET /products/:id` | any authenticated |
| `PUT /products/:id/recipe` | `OWNER`, `ADMIN` |
| `GET /products/:id/recipe` | any authenticated |

Recipe routes live on this controller and delegate to `RecipesService` (`modules/recipes`). `RecipesService` imports `products.mapper.ts` as a plain file, not a provider, to avoid a Nest dependency cycle.

`GET /products` is deliberately **unpaginated** and ordered by name, because master data is small.

## HPP (`hpp.calculator.ts`)

```
baseHpp = Σ(quantityUsed × unitCost)                         unrounded
hpp     = round2_HALF_UP(baseHpp × (1 + wastePercent / 100))
```

- **One implementation.** The live HPP shown in master data and the `SaleItem.hppAtSale` snapshot taken at sale time both call `calculateHpp`, and **both must pass `wastePercent`**. Two implementations, or one call site omitting waste, would make live and snapshot figures drift, which is what ADR-005 forbids.
- **Round once, at the end.** Rounding per line would make HPP depend on how a recipe happens to be split into rows (two lines of 0,004 would round to 0,00 each instead of 0,01 total). Rounding `baseHpp` before applying waste causes the same problem one step later.
- **Empty recipe → `null`, never 0** (ADR-013). "No recipe" is a different fact from "costs nothing". Callers must not treat `null` as 0, and the Sales module rejects such products rather than selling at a 100% margin. A waste percentage on a product without a recipe is still `null`.
- **Waste affects HPP only.** It never changes how much stock a sale deducts; `RecipeItem.quantityUsed` is untouched.
- `wastePercent` defaults to 0, so a client that predates the field gets HPP equal to the recipe sum.

## Product response (`products.mapper.ts`)

Every read eager-loads `recipeItems.rawMaterial` and maps through `toProductWithHppResponse`, so computed fields are consistent everywhere.

| Field | Meaning |
|---|---|
| `baseHpp` | Pre-waste recipe sum, rounded **for display only** (the calculator uses the unrounded value) |
| `hpp` | Final HPP including waste, or `null` |
| `margin` | `sellPrice − hpp`, or `null` |
| `hasRecipe` | `recipeItems.length > 0` |
| `makeableQuantity` | `min(floor(currentStock / quantityUsed))` over recipe lines, for the POS. A whole-unit count, which makes it the one legitimate `.toNumber()` |
| Recipe `lineCost` | Display only, never summed to produce HPP |

`baseHpp`, waste and `hpp` are all shown, so per-line costs visibly add up to `baseHpp` and the waste uplift to `hpp` is explicit rather than silently folded in (ADR-024). Every decimal is serialized with an explicit `.toFixed(scale)`, because `Prisma.Decimal.toJSON()` drops the scale.

## Recipes (`RecipesService`)

- `PUT /products/:id/recipe` **replaces** the whole recipe atomically in one transaction. Every call inside the callback uses `tx`, never `this.prisma`.
- `GET` for a product with no recipe returns 200 with `items: []`, `hpp: null`, `hasRecipe: false`.

## Deletion

`RecipeItem` cascades with its product. `SaleItem → Product` is **Restrict**, so deleting a product that has been sold hits Postgres `P2003`. This maps to `ProductInUseException` instead of a raw 500, anticipating the problem ERR-004 recorded for raw materials. Deactivate a sold product instead (`isActive: false`).

## Photos (`ProductPhotoService`)

Uploads go to Cloudinary under a deterministic public id `ohmypos/product_<productId>` with `overwrite: true`, so re-uploading never orphans an old image. The resulting `secure_url` is stored on `Product.photoUrl`.

## Testing

| File | Covers |
|---|---|
| `hpp.calculator.spec.ts` | Round-once vs per-line rounding, waste multiplication order, 6dp unit costs, empty recipe |
| `test/master-data.e2e-spec.ts` | RBAC, decimal scale, atomic recipe replace, live HPP recalculation |
