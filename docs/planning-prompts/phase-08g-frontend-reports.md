# Planning Prompt — Phase 8g: Frontend — Reports Screens

**Intended model:** Sonnet
**Depends on:** Phase 7 (Reporting backend), Phase 8a (nav/auth shell)

---

## Prompt (paste into a fresh session)

You are generating an **implementation plan** for OhMyPos frontend — do not write code yet.

First read: `AGENTS.md`, `docs/04 - Engineering_Playbook.md`, `docs/00 - PRD.md` §5.4, `docs/DESIGN.md` mockup for this screen, the Phase 7 plan output (exact API shapes for P&L, sales-per-product profit, income by payment method, top 10 products, daily income).

**AGENTS.md governance applies in full**: ≥3 implementation options where genuine choices exist; no unrelated refactors; no Git writes.

### Scope

Build the `(back-office)/reports` screens (PRD §5.4), all filterable by date range and branch:
- P&L summary
- Sales-per-product profit
- Income by payment method
- Top 10 products
- Daily income, with supporting charts

### Why this stays Sonnet, not Opus

All aggregation happens server-side (ADR-008, query-time computation) — this screen is rendering pre-computed numbers with filters and charts, not deriving business logic client-side. If, while planning, you find yourself needing non-trivial client-side recomputation (e.g. re-aggregating across a client-side date range instead of re-querying), stop and flag it — that likely means the Phase 7 API contract needs a filter parameter added, not client logic to work around it.

### Constraints

- Reuse `packages/ui` primitives and the data-fetching pattern from Phase 8a.
- Use the Flow Indicator pattern (AGENTS.md glossary, `docs/DESIGN.md`) for inflow/outflow figures, consistent with Phase 8f.
- Chart library choice: check `packages/ui`/`package.json` first for anything already installed before proposing a new dependency — adding a new package dependency requires approval per AGENTS.md governance.

### Deliverable

An implementation plan with:
1. Screen/component breakdown for the 5 report views + shared date-range/branch filter component.
2. Chart approach (reusing existing deps if present; flag clearly if a new dependency is genuinely needed, with the approval callout per AGENTS.md).
3. Light-to-moderate test plan per Playbook §10 (filter correctness matters more than visual chart testing).

Wait for human approval before writing any code.
