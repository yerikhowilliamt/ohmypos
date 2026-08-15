# Planning Prompt — Phase 7: Reporting Backend

**Intended model:** Opus
**Depends on:** Phase 3, 4, 5, 6 (reports aggregate across all of them)
**Blocks:** Phase 8f (Reports frontend)

---

## Prompt (paste into a fresh session)

You are generating an **implementation plan** for OhMyPos — do not write code yet.

First read, in this order: `AGENTS.md`, `docs/04 - Engineering_Playbook.md`, `docs/00 - PRD.md` §5.4, `docs/01 - System_Design.md` §11 (risks — report query performance is explicitly flagged), `docs/02 - ADR.md` ADR-005, ADR-008, `docs/03 - ERD.md`, and the outputs of Phase 3–6 plans (all domain data must already exist).

**AGENTS.md governance applies in full**: schema changes need approval first (reports should generally need none — flag it if your design does); ≥3 implementation options required; no unrelated refactors; no Git writes.

### Scope

Build (PRD §5.4 "Dashboard 3"), all filterable by date range and branch:
- P&L (income vs. expenses vs. COGS)
- Sales-per-product profit (uses `SaleItem.hppAtSale`, not live `Product` HPP — ADR-005, this is why the snapshot exists)
- Income by payment method
- Top 10 products
- Daily income

### Design constraint (ADR-008)

Computed at query time, no materialized views in v1. `docs/01 - System_Design.md` §11 already flags query performance as a known risk at scale — your plan should note this trade-off explicitly (accept it for v1 per ADR-008, or make the case for revisiting ADR-008 now if the query plan looks bad) rather than silently over- or under-optimizing.

### Correctness constraint

P&L and sales-per-product profit must read `SaleItem.hppAtSale` (the snapshot), never `Product`'s live HPP — otherwise historical reports change retroactively when a raw material's cost updates, which is the exact bug AGENTS.md's Troubleshooting table warns about.

### Testing (Playbook §10)

Reporting logic should get solid coverage since it's aggregation-heavy and easy to get subtly wrong (e.g. a Payable settlement affecting P&L only when the LedgerEntry lands, not at purchase time — ADR-006). Plan for: a date range spanning a partial month, branch filter correctness (centralized cash/stock still needs to attribute correctly per `branchId`), and a report period containing a payable settled mid-period.

### Deliverable

An implementation plan with:
1. ≥3 options for query construction (e.g. raw SQL aggregation vs. Prisma aggregate/groupBy composition vs. a query-builder layer shared across the 5 reports), trade-offs, recommendation — with an eye on the §11 performance risk.
2. Confirmation that no schema changes are needed (or a flagged proposal if they are).
3. Test plan covering the cases above.

Wait for human approval before writing any code.
