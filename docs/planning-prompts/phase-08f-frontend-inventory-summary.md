# Planning Prompt — Phase 8f: Frontend — Inventory Summary Screen

**Intended model:** Sonnet
**Depends on:** Phase 6 (Inventory backend), Phase 8a (nav/auth shell)

---

## Prompt (paste into a fresh session)

You are generating an **implementation plan** for OhMyPos frontend — do not write code yet.

First read: `AGENTS.md`, `docs/04 - Engineering_Playbook.md`, `docs/00 - PRD.md` §5.6, `docs/DESIGN.md` mockup for this screen, the Phase 6 plan output (exact Inventory Summary API shape — opening/in/out/closing per raw material per period, plus the stock-status flag).

**AGENTS.md governance applies in full**: ≥3 implementation options where genuine choices exist; no unrelated refactors; no Git writes.

### Scope

Build the `(back-office)/inventory` summary view (PRD §5.6): a table of opening/in/out/closing stock per raw material for a selected period, with the OK/low/out status rendered using the app's Flow Indicator motif (AGENTS.md glossary — "the signature UI motif for any inflow/outflow number", see `docs/DESIGN.md`) for the in/out columns specifically.

### Constraints

- This is a read-only, server-aggregated table — do not recompute opening/in/out/closing client-side, render exactly what the API returns.
- Reuse `packages/ui` primitives and the data-fetching pattern from Phase 8a.
- Use the Flow Indicator component/pattern already established in `packages/ui`/`docs/DESIGN.md` rather than building a new one for this screen.

### Deliverable

An implementation plan with:
1. Screen/component breakdown (period + branch filter, summary table, status badge/flag rendering).
2. Confirmation of how the Flow Indicator pattern is reused here.
3. Light test plan per Playbook §10 (this is presentational; verify filter interactions and empty/zero-stock states render sensibly).

Wait for human approval before writing any code.
