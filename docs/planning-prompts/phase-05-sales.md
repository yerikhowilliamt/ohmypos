# Planning Prompt — Phase 5: Sales Backend

**Intended model:** Opus
**Depends on:** Phase 3 (Product/HPP), Phase 4 (stock must exist to decrement)
**Blocks:** Phase 6, 7

**This is the highest-risk phase in the whole remaining roadmap** — it's the core money+stock transaction the entire app exists for. Treat it accordingly: more scrutiny, more test cases, no shortcuts on the transaction/lock rules.

---

## Prompt (paste into a fresh session)

You are generating an **implementation plan** for OhMyPos — do not write code yet.

First read, in this order: `AGENTS.md` in full (especially the Troubleshooting table and Glossary), `docs/04 - Engineering_Playbook.md` §6, §7, §8, §10, `docs/00 - PRD.md` §5.2, `docs/02 - ADR.md` ADR-004, ADR-005, ADR-006, ADR-007, `docs/03 - ERD.md`, `docs/08 - Tech_Debt_Log.md` DEBT-004, the outputs of the Phase 3 and Phase 4 plans (Product/HPP and StockMovement must already exist).

**AGENTS.md governance applies in full**: schema changes need approval first; ≥3 implementation options required; no unrelated refactors; no Git writes.

### Pre-step — resolve before planning any code

`docs/08 - Tech_Debt_Log.md` DEBT-004 (Medium, but blocking for this phase specifically): tax, discount, order type, and purchase-approval fields appear in the approved DESIGN.md mockup but have no schema support. **Tax and discount must be decided together before this phase starts**, because both change the definition of `Sale.totalAmount`, which every report in Phase 7 will read. If you don't have an explicit go/no-go on tax/discount for v1, stop and ask rather than guessing a schema shape.

### Scope

Build the Sale flow (PRD §5.2 "Dashboard 2.1"):
- `Sale` / `SaleItem` — multi-line sale, price override per line, branch/payment-method/timestamp tagging.
- On creation, atomically: snapshot HPP onto `SaleItem.hppAtSale` (ADR-005 — this protects historical P&L from later raw-material price changes, see AGENTS.md Troubleshooting: "Historical P&L changed after a raw material price update"), decrement `RawMaterial` stock via `StockMovement` (outbound), create an income `LedgerEntry`.

### Non-negotiable rules

- **Row lock (ADR-007):** `SELECT ... FOR UPDATE` on every `RawMaterial` row touched by the sale's recipe fan-out, acquired *before* the stock decrement, inside the same transaction. AGENTS.md's Troubleshooting table names the failure mode directly: "Duplicate/incorrect stock balance under concurrent sales → Missing `FOR UPDATE` lock." Your plan must show lock acquisition order (to avoid deadlocks when two concurrent sales touch overlapping raw materials in different order) — this is the one place in the whole roadmap where lock ordering deserves explicit design, not an afterthought.
- **Single transaction (Playbook §7):** stock decrement + `LedgerEntry` creation + `SaleItem.hppAtSale` write all happen in one Prisma `$transaction`, with a plan for what happens on `InsufficientStockException` (Playbook §6, already named) — the whole sale must roll back, not partially commit.
- **Guards:** `BranchScopeGuard` + `RoleGuard` together (Playbook §8) — a `Sale` is branch-attributed and KASIR-creatable but scoped to their own branch only.

### Testing (Playbook §10 — explicitly "must have thorough tests")

Plan for: concurrent sales racing on the same raw material (lock contention correctness, not just happy path), insufficient-stock rejection + full rollback, HPP snapshot immutability after a later raw-material cost change, branch-scope enforcement (KASIR cannot write another branch's sale).

### Deliverable

An implementation plan with:
1. ≥3 options for lock acquisition strategy across a multi-item sale (e.g. lock all raw materials up front in a fixed order vs. lock lazily per item vs. pessimistic vs. optimistic with retry), trade-offs, recommendation.
2. Proposed Prisma schema additions for `Sale`/`SaleItem` including however tax/discount was resolved (flagged for approval).
3. Full transaction boundary walkthrough with the rollback path explicit.
4. Test plan covering the concurrency case in detail.

Wait for human approval before writing any code.
