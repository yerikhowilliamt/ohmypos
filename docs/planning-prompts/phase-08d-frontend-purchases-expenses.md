# Planning Prompt — Phase 8d: Frontend — Purchases & Expenses Screens

**Intended model:** Sonnet
**Depends on:** Phase 4 (Purchasing & Payables backend), Phase 8a (nav/auth shell)

---

## Prompt (paste into a fresh session)

You are generating an **implementation plan** for OhMyPos frontend — do not write code yet.

First read: `AGENTS.md`, `docs/04 - Engineering_Playbook.md`, `docs/00 - PRD.md` §5.3, `docs/DESIGN.md` mockup for this screen, the Phase 4 plan output (exact `Supplier`/`SupplierPurchase`/`Payable`/`PayableSettlement` API shapes).

**AGENTS.md governance applies in full**: ≥3 implementation options where genuine choices exist; no unrelated refactors; no Git writes.

### Scope

Build the `(back-office)/expenses` screen(s) (PRD §5.3):
- General expense entry (categorized, branch-tied)
- Supplier purchase entry — paid-now vs. payable/utang toggle, matching ADR-006's branch in the backend
- Payable list with running balance per supplier, partial/full settlement action

### Constraints

- Reuse `packages/ui` primitives and the data-fetching pattern from Phase 8a.
- Zod schemas from `packages/api-contracts` for all forms.
- This is form-and-table heavy CRUD-with-workflow (paid/unpaid branching, settlement action) — no complex client-only state expected, which is why this is scoped for Sonnet. If the plan discovers meaningful client-side derived state (e.g. live-computed remaining payable balance before submit), flag it rather than quietly building something heavier than expected.

### Deliverable

An implementation plan with:
1. Screen/component breakdown for expense entry, purchase entry (with the paid/unpaid branch), and payable settlement.
2. Form validation approach reusing `api-contracts` schemas.
3. Test plan (Playbook §10 — CRUD forms are lighter tier, but the settlement action touching money deserves real coverage: partial settlement UI state, rejecting settlement beyond remaining balance client-side as UX help while trusting the backend as final authority).

Wait for human approval before writing any code.
