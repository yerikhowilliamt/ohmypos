# Planning Prompt — Phase 4: Purchasing & Payables Backend

**Intended model:** Opus
**Depends on:** Phase 3 (Master Data — `RawMaterial` must exist)
**Blocks:** Phase 5 (Sales needs stock to decrement), Phase 6, 7

---

## Prompt (paste into a fresh session)

You are generating an **implementation plan** for OhMyPos — do not write code yet.

First read, in this order: `AGENTS.md`, `docs/04 - Engineering_Playbook.md`, `docs/00 - PRD.md` §5.3, `docs/02 - ADR.md` (especially ADR-006, ADR-007), `docs/03 - ERD.md`, `docs/07 - Task_Log.md`, and the plan/output produced from `phase-03-master-data.md` (Master Data must already be implemented).

**AGENTS.md governance applies in full**: schema changes need approval first; ≥3 implementation options required; no unrelated refactors; no Git writes.

### Scope

Build Purchasing & Payables (PRD §5.3 "Dashboard 2.2", raw-material side):
- `Supplier` — CRUD.
- `SupplierPurchase` / `SupplierPurchaseItem` — a purchase of raw materials from a supplier. Supports central purchases (`branchId = null`) per the "Central Purchase" glossary entry in AGENTS.md.
- `Payable` / `PayableSettlement` — tracks utang (debt) to a supplier for unpaid purchases, partial/full settlement.
- `StockMovement` — records the **inbound** stock movement created by a purchase.

### Critical rule — ADR-006

A `SupplierPurchase` must **only** create a `LedgerEntry` if `paymentStatus = PAID` at creation time. If unpaid, it creates a `Payable` instead — the `LedgerEntry` is created later, at settlement. Getting this backwards is explicitly called out in AGENTS.md's Troubleshooting table ("An expense shows up before money actually left the account"). Your plan must show exactly where in the flow this branch happens.

### Transaction boundary rule (Playbook §7 — non-negotiable)

Any single operation that writes to more than one of `{LedgerEntry, StockMovement, Payable}` must happen inside exactly one Prisma `$transaction`. This applies to both `SupplierPurchase` creation (stock + payable/ledger) and `PayableSettlement` creation (payable status + ledger).

### Guards

`BranchScopeGuard` applies except for central purchases (`branchId = null` bypasses branch filtering by design, not by omission — plan needs to show how the guard handles the null case explicitly).

### Testing (Playbook §10)

`Payable`/`PayableSettlement` flow is explicitly "must have thorough tests" per Playbook §10 — plan for: partial settlement, over-settlement rejection, settlement of an already-fully-settled payable (`PayableAlreadySettledException`, already named in Playbook §6), and the paid-vs-unpaid `LedgerEntry` branch from ADR-006.

### Deliverable

An implementation plan with:
1. ≥3 options for modeling the payable balance (e.g. derived from settlement sum each time vs. maintained running balance field vs. DB-computed view), trade-offs, recommendation.
2. Proposed Prisma schema additions (flagged for approval).
3. Transaction boundary diagram/description for both flows (purchase creation, settlement creation).
4. Test plan covering the cases above.

Wait for human approval before writing any code.
