# Planning Prompt — Phase 8e: Frontend — Opening Stock Screen

**Intended model:** Sonnet
**Depends on:** Phase 6 (Inventory backend), Phase 8a (nav/auth shell)

---

## Prompt (paste into a fresh session)

You are generating an **implementation plan** for OhMyPos frontend — do not write code yet.

First read: `AGENTS.md`, `docs/04 - Engineering_Playbook.md`, `docs/00 - PRD.md` §5.5, `docs/DESIGN.md` mockup for this screen, the Phase 6 plan output (exact `OpeningStock` API shape).

**AGENTS.md governance applies in full**: ≥3 implementation options where genuine choices exist; no unrelated refactors; no Git writes.

### Scope

Build the `(back-office)/inventory` opening-stock entry screen (PRD §5.5): monthly opening stock quantity per `RawMaterial`, plus unit price entry only when no purchase exists yet for that material for the period (the backend should expose whether this applies per material — don't reimplement that business rule client-side, just render what the API says).

### Constraints

- Reuse `packages/ui` primitives and the data-fetching pattern from Phase 8a.
- Zod schemas from `packages/api-contracts`.
- Straightforward period-scoped form/table — no complex client state expected.

### Deliverable

An implementation plan with:
1. Screen/component breakdown (period selector, per-material quantity + conditional unit-price input).
2. Form validation approach reusing `api-contracts` schemas.
3. Light test plan per Playbook §10.

Wait for human approval before writing any code.
