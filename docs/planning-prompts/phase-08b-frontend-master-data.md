# Planning Prompt — Phase 8b: Frontend — Master Data Screens

**Intended model:** Sonnet
**Depends on:** Phase 3 (Master Data backend), Phase 8a (nav/auth shell)

---

## Prompt (paste into a fresh session)

You are generating an **implementation plan** for OhMyPos frontend — do not write code yet.

First read: `AGENTS.md`, `docs/04 - Engineering_Playbook.md`, `docs/DESIGN.md` and the approved mockup it references (reference, not spec — note any place the mockup shows fields with no schema support, e.g. SKU/barcode per DEBT-004, and flag rather than build), the Phase 3 plan output (exact `RawMaterial`/`Recipe`/`Product` API shape), `packages/api-contracts/src` for the actual Zod schemas to consume.

**AGENTS.md governance applies in full**: ≥3 implementation options where genuine choices exist; no unrelated refactors; no Git writes.

### Scope

Build the `(back-office)/master-data` screens (PRD §5.1):
- Raw material list/CRUD
- Recipe/BOM editor (attach `RawMaterial`s + quantities to a `Product`)
- Product list/CRUD, showing live HPP from the backend (do not recompute HPP client-side — display what the API returns)

### Role/route constraint

Per `docs/01 - System_Design.md` §5, `master-data` is reachable by ADMIN and OWNER (KASIR does not get this route at all). This is standard CRUD-with-tables-and-forms work — no complex client state expected here, which is why this prompt is scoped for Sonnet.

### Constraints

- Reuse `packages/ui` primitives (`button`, `card`, `input`, `label`) — extend, don't duplicate.
- Follow whatever data-fetching pattern Phase 8a's plan establishes (React Query/SWR/etc.) — don't introduce a second one.
- Forms validate against the same Zod schemas from `packages/api-contracts` used by the backend (ADR-010) — no hand-typed request/response shapes.

### Deliverable

An implementation plan with:
1. Screen/component breakdown for the three CRUD areas + the recipe editor (the one place here with real interaction complexity — attaching/removing raw materials with quantities).
2. Form validation approach reusing `api-contracts` schemas.
3. Test plan (Playbook §10 — "should have" tier for master-data CRUD; the recipe editor's add/remove/quantity-edit interactions deserve real coverage, plain CRUD forms don't need much).

Wait for human approval before writing any code.
