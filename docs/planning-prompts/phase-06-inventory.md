# Planning Prompt — Phase 6: Inventory Backend

**Intended model:** Opus
**Depends on:** Phase 4 (purchase-side `StockMovement`), Phase 5 (sale-side `StockMovement`)
**Blocks:** Phase 7

---

## Prompt (paste into a fresh session)

You are generating an **implementation plan** for OhMyPos — do not write code yet.

First read, in this order: `AGENTS.md`, `docs/04 - Engineering_Playbook.md`, `docs/00 - PRD.md` §5.5, §5.6, `docs/02 - ADR.md` ADR-004, ADR-008, `docs/03 - ERD.md`, and the outputs of the Phase 4 and Phase 5 plans (both directions of `StockMovement` must already exist).

**AGENTS.md governance applies in full**: schema changes need approval first; ≥3 implementation options required; no unrelated refactors; no Git writes.

### Scope

Build (PRD §5.5 "Dashboard 4", §5.6 "Dashboard 5"):
- `OpeningStock` — monthly opening stock quantity per `RawMaterial` (+ unit price, only if no purchase exists yet for that material).
- Inventory Summary — computed view: opening / in / out / closing stock per `RawMaterial` per period, plus an auto stock-status flag (OK / low / out) against a threshold.

### Design constraints

- Stock is centralized, single pool (ADR-004) — there is **no per-branch balance anywhere**. Do not build this as if branches have independent stock; `branchId` on movements is attribution only.
- Reports/summaries are computed at query time in v1, no materialized views (ADR-008) — this applies here too; don't introduce a stored "closing stock" field that could drift from the movement ledger.
- `in` = sum of purchase-side `StockMovement` in the period; `out` = sum of sale-side `StockMovement` in the period; `closing` = `opening + in - out`. This must reconcile exactly against the sum of all `StockMovement` rows — that reconciliation is the thing to test hardest, not the CRUD.

### Testing (Playbook §10)

Plan for: a period with no `OpeningStock` recorded, a raw material added mid-period (no opening stock, first movement is a purchase), the closing-stock arithmetic reconciling against raw `StockMovement` sums across a full month, and the low/out threshold flag at exact boundary values.

### Deliverable

An implementation plan with:
1. ≥3 options for computing the summary (e.g. pure query-time aggregation vs. a DB view vs. a scheduled recompute — note ADR-008 already leans against materialization, justify your recommendation against it), trade-offs, recommendation.
2. Proposed Prisma schema additions for `OpeningStock` (flagged for approval).
3. Test plan covering the reconciliation case explicitly.

Wait for human approval before writing any code.
