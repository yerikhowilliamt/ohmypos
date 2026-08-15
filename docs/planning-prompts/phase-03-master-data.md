# Planning Prompt — Phase 3: Master Data Backend

**Intended model:** Opus
**Depends on:** Phase 2 (Auth & RBAC) — done
**Blocks:** Phase 4, 5, 6, 7, and all frontend prompts

---

## Prompt (paste into a fresh session)

You are generating an **implementation plan** for OhMyPos — do not write code yet.

First read, in this order: `AGENTS.md`, `docs/04 - Engineering_Playbook.md`, `docs/00 - PRD.md` §5.1, `docs/02 - ADR.md` (especially ADR-005, ADR-007, ADR-010, ADR-012), `docs/03 - ERD.md` (entities + §7 Porting Notes), `docs/07 - Task_Log.md` (what Phase 0–2 already built), `docs/08 - Tech_Debt_Log.md` (DEBT-004, DEBT-005).

**AGENTS.md governance applies in full**: schema/migration changes need explicit human approval before you touch `schema.prisma`; your plan must include ≥3 implementation options with trade-offs; do not perform any Git write operations; strict scope, no unrelated refactors.

### Pre-step — resolve before planning any code

`docs/08 - Tech_Debt_Log.md` DEBT-005 (High priority) is a blocking product decision, not something to discover mid-implementation:
- Does the POS derive a "makeable quantity" per `Product` from `RawMaterial` stock (there is no per-product stock field in the ERD)?
- Confirm HPP is recipe-based per ADR-005 (live-computed on `Product`, snapshotted only at `Sale` time in Phase 5) — not moving-average, which the approved DESIGN.md mockup incorrectly implies.

If this decision has architectural weight, propose a new ADR as part of your plan rather than silently assuming an answer.

### Scope

Build the Master Data domain (PRD §5.1 "Dashboard 1"):
- `RawMaterial` — name, UOM, unit cost. CRUD.
- `Recipe` / `RecipeItem` — bill-of-materials linking a `Product` to the `RawMaterial`s (+ quantities) that make it.
- `Product` — name, sell price, live-computed HPP derived from its `Recipe` (ADR-005).

Reuse existing patterns instead of inventing new ones:
- Module structure: mirror `apps/api/src/modules/{accounts,categories,branches}` (controller/service/module/dto).
- Zod contracts: mirror `packages/api-contracts/src/{account,category,branch}.schema.ts` — add `raw-material.schema.ts`, `recipe.schema.ts`, `product.schema.ts`, export from `index.ts`.
- Guards: master data is generally OWNER/ADMIN write, KASIR read-only (needed for POS in Phase 5/8) — apply `RoleGuard` explicitly per Playbook §8, do not assume it's automatic.
- Decimal precision: money `Decimal(18,2)`, quantities `Decimal(18,4)` per ADR-012 — do not use `number`/float for cost or quantity fields.

### Testing (Playbook §10)

Master-data CRUD is "should have" tier, but the **HPP calculation is not** — every downstream report and the Sale flow depend on it being correct. Plan for thorough unit + integration coverage on recipe-cost calculation specifically (e.g. missing recipe item, zero-cost raw material, recipe changes after products already exist).

### Deliverable

An implementation plan with:
1. ≥3 options for how live HPP calculation is structured (e.g. computed at query time vs. stored + recalculated on recipe/cost change vs. computed field via DB view), trade-offs, and your recommendation.
2. Proposed Prisma schema additions (flagged for approval, not applied).
3. Module/file list, guard placement, test plan.

Wait for human approval before writing any code.
