# Planning Prompt — Phase 8h: Frontend — Reconciliation/Matching Screen

**Intended model:** Opus (the second screen you flagged — split-allocation math and matching-review workflow are the kind of interactive logic that's easy to get subtly wrong)
**Depends on:** Phase 1 (Reconciliation/Matching backend — already done, no new backend work needed here), Phase 8a (nav/auth shell)

**Note:** unlike every other Phase 8 screen, this one's backend has existed since Phase 1. It's only sequenced here because of the backend-first-then-all-frontend ordering you chose — there's no functional reason it couldn't be pulled earlier if you want a demoable slice sooner.

---

## Prompt (paste into a fresh session)

You are generating an **implementation plan** for OhMyPos frontend — do not write code yet.

First read: `AGENTS.md` (Glossary — Reconciliation, Admin/Owner role restrictions), `docs/04 - Engineering_Playbook.md`, `docs/00 - PRD.md` §5.7, `docs/DESIGN.md` mockup for this screen, `docs/03 - ERD.md` (`BankTransaction`, `Allocation`, `AllocationStatus`), `apps/api/src/modules/{matching,allocation,reconciliation,import}` (the actual backend implementation — read the real service code, this screen must faithfully reflect what the `MatchingEngine` and `AllocationService` actually enforce, not what you assume they do).

**AGENTS.md governance applies in full**: ≥3 implementation options where genuine choices exist; no unrelated refactors; no Git writes.

### Scope

Build the `(back-office)/reconciliation` screen (PRD §5.7):
- Bank statement CSV import trigger/status (backed by `Import`'s `BankParser` strategy)
- Auto-match review queue — the `MatchingEngine`'s proposed matches between `BankTransaction` and `LedgerEntry`, with accept/reject
- Manual split-allocation UI — user creates one or more `Allocation`s against a `BankTransaction`, honoring the invariant `sum(Allocation.amountPortion) <= BankTransaction.amount` (ERD). The UI must prevent submitting an over-allocated split *before* it hits the backend, while still trusting the backend as final authority (the backend enforces this per `docs/06 - Error_Log.md`/tests already in `apps/api/test/allocation-sum.e2e-spec.ts` — read that test to understand the exact boundary behavior expected).

### Role restriction (ADR-011 — enforced, don't just decorate)

Reconciliation matching is ADMIN/OWNER only (AGENTS.md glossary: "Kasir... cannot create users or perform reconciliation matching"). Backend already enforces this (Phase 2, retrofitted per TASK-003 handoff notes) — this screen only needs correct route placement (already scoped via `docs/01 - System_Design.md` §5) and graceful handling of a 403, not its own authorization logic.

### Why this needs careful design (not just CRUD)

The split-allocation interaction has real invariants (sum ≤ amount, no double-allocating the same `LedgerEntry` per whatever uniqueness rule the backend enforces — check `AllocationStatus` transitions) that must be visible to the user *while they're building the split*, not just rejected after submit. Get the running-total-vs-remaining feedback wrong and the operator will submit invalid splits repeatedly, or worse, misread a valid split as invalid and abandon a real match.

### Constraints

- Reuse `packages/ui` primitives and the data-fetching pattern from Phase 8a.
- Zod schemas from `packages/api-contracts/src/{allocation,matching,reconciliation,bank-transaction}.schema.ts` — these already exist, read them before designing the forms.

### Deliverable

An implementation plan with:
1. ≥3 options for the split-allocation UI's running-total feedback (e.g. client-recomputed remaining amount vs. optimistic-then-reconciled-with-server vs. submit-per-line with server confirmation each time), trade-offs, recommendation.
2. Match-review queue interaction design (accept/reject flow, what happens to a rejected auto-match).
3. Test plan: over-allocation prevention in the UI, partial-then-complete split across multiple submissions, 403 handling for a KASIR who somehow reaches the route.

Wait for human approval before writing any code.
