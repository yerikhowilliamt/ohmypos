# Raw Materials

**Owner module for:** `RawMaterial` master data (name, units, cost, thresholds)
**Related:** ERD §3 · ADR-004, ADR-007, ADR-010, ADR-011, ADR-024 · ERR-004

## Overview

Raw materials form one **centralized stock pool** with no `branchId` (ADR-004), so these endpoints have no `BranchScopeGuard`.

| Endpoint | Roles |
|---|---|
| `POST /raw-materials`, `PATCH /raw-materials/:id`, `DELETE /raw-materials/:id` | `OWNER`, `ADMIN` |
| `GET /raw-materials`, `GET /raw-materials/:id` | any authenticated (the POS reads stock) |

`GET /raw-materials` is unpaginated and ordered by name, because master data is small.

## Stock and cost

- **`currentStock`** is not writable through CRUD. It changes only through `StockMovementsService`, under a row lock, in the same transaction as the movement (ADR-007).
- **`unitCost`** can be set here (create and `PATCH`), but every purchase overwrites it with the latest purchase's cost (see the Supplier Purchases README, "latest-cost write-back"). Sales, voids and stock-takes never change it.

## Units (ADR-024)

| Field | Meaning | Editable? |
|---|---|---|
| `unit` | **Stock/recipe base unit** (e.g. `gram`). `currentStock`, `RecipeItem.quantityUsed`, `OpeningStock.quantity` and every `StockMovement` are in this unit | **Locked once the material has any stock movement** |
| `purchaseUnit` | What the supplier sells (e.g. `kg`, `box`) | Always |
| `conversionFactor` | Base units per purchase unit (e.g. 1000) | Always |

- **Why the base unit locks:** changing it would silently rescale `currentStock`, every recipe quantity, every opening stock and every row of the append-only movement log, which means rewriting history. A packaging change (say the supplier switches from single items to 5-packs) is a `purchaseUnit` / `conversionFactor` edit. Those stay freely editable, and historical purchase lines keep their own snapshot, so nothing already recorded moves.
- **Only a real change is blocked.** The edit form sends the whole object on every save, so resubmitting the same `unit` must succeed, or the form would become unusable the moment stock exists. A real change throws `RawMaterialUnitLockedException` (400).
- `isBaseUnitLocked` comes from the movement count, selected as one extra column on the same query (no second round trip, no N+1).

## Serialization

`unitCost` is serialized at **6dp**, not 2: a per-unit cost is a rate (Rp10.000 / 3.000 g = 3,333333/g). The UI rounds it for display, while the API returns the value the arithmetic actually used. Stock quantities use 4dp.

## Errors

| Exception | HTTP | Raised when |
|---|---|---|
| `RawMaterialNameTakenException` | 409 | Duplicate name |
| `RawMaterialInUseException` | 409 | Delete blocked by a `Restrict` foreign key (a recipe, purchase or movement references it). ERR-004 recorded these constraints surfacing as failures |
| `RawMaterialUnitLockedException` | 400 | Base unit change after stock history exists |

## Testing

| File | Covers |
|---|---|
| `raw-materials.service.spec.ts` | Base-unit lock vs editable packaging, 6dp cost serialization |
| `test/master-data.e2e-spec.ts` | RBAC, CRUD, decimal scale |
