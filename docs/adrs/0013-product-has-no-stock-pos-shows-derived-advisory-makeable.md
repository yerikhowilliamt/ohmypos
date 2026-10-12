# ADR-013: Product has no stock; POS shows derived advisory makeable quantity, and HPP stays recipe-based

**Status:** Accepted

**Context:** DEBT-005 highlighted a conflict between the Claude Design mockup (`OhMyPos App.dc.html`) and the system's stock and costing architecture (ADR-004, ADR-005, ADR-007). The mockup showed a per-product stock counter ("Es Kopi Susu ... 48") and stated inventory valuation is "dihitung dari HPP rata-rata bergerak" (moving-average cost).

In OhMyPos, stock is centralized in `RawMaterial` (ADR-004) and decremented under `FOR UPDATE` pessimistic row lock at sale time (ADR-007). `Product` has no stored stock field. Furthermore, ADR-005 defines HPP as recipe-based (computed live from `RecipeItem.quantityUsed × RawMaterial.unitCost`), which is snapshotted onto `SaleItem.hppAtSale` at sale time.

**Decision:**
1. **No per-product stock stored:** `Product` has no `stock` or `currentStock` column. The POS displays a **derived, advisory makeable quantity**:
   `makeableQty(product) = floor( min over recipeItems of ( rawMaterial.currentStock / recipeItem.quantityUsed ) )`
   This is computed live on read queries. If a product has no recipe, `makeableQuantity` is `null`. It is a visual hint, never authoritative, and never reserved. Actual stock availability is strictly enforced at sale time by raw material locks (ADR-007).
2. **HPP stays recipe-based per ADR-005:** Moving-average costing is explicitly rejected. HPP is computed live at query time from `RecipeItem.quantityUsed × RawMaterial.unitCost`, rounded once `HALF_UP` to 2 decimal places. `design.md`'s mockup copy is corrected to match.
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
