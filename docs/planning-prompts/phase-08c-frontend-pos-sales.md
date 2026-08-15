# Planning Prompt — Phase 8c: Frontend — POS/Sales Screen

**Intended model:** Opus (this is one of the two frontend screens you flagged as needing heavier reasoning — cart state, price override, and stock-derived quantity all interact live as the user types)
**Depends on:** Phase 3 (Product/HPP), Phase 4 (stock exists), Phase 5 (Sale backend), Phase 8a (nav/auth shell)

---

## Prompt (paste into a fresh session)

You are generating an **implementation plan** for OhMyPos frontend — do not write code yet.

First read: `AGENTS.md`, `docs/04 - Engineering_Playbook.md`, `docs/00 - PRD.md` §5.2, `docs/DESIGN.md` and the mockup's POS screen specifically, the Phase 5 plan output (exact `Sale`/`SaleItem` API contract, including however DEBT-004's tax/discount decision landed), `docs/08 - Tech_Debt_Log.md` DEBT-005 (whether "makeable quantity" is shown — this directly shapes this screen).

**AGENTS.md governance applies in full**: ≥3 implementation options where genuine choices exist; no unrelated refactors; no Git writes.

### Scope

Build the `(pos)/sales` screen (PRD §5.2) — the only route a KASIR sees, branch-scoped:
- Product selection with running cart (multi-line)
- Per-line price override
- If DEBT-005 resolved to show makeable quantity: live feedback as items are added to the cart (does adding this line exceed available raw material for *already-queued* cart lines, not just current stock — this is the subtle part)
- Submit → calls the Phase 5 `Sale` creation endpoint, handles `InsufficientStockException` (Playbook §6) with a clear in-cart error, not a generic toast
- Payment method selection tied to `Account` (per AGENTS.md glossary — payment methods map to `Account`)

### Why this needs careful design (not just CRUD)

The cart is client-side derived state that must stay consistent with server-side truth it doesn't have a live subscription to (no websockets/real-time in this project — System Design §9, everything is request/response). Concretely: if makeable-quantity is shown, it needs to account for *other items already in the same cart* competing for the same raw material, and must not drift from reality between "shown available" and "submit time" (server is the final authority — `InsufficientStockException` on submit is the real guard, the client-side number is UX assistance only, never treat it as the source of truth).

### Constraints

- Reuse `packages/ui` primitives and whatever data-fetching pattern Phase 8a established.
- Zod schemas from `packages/api-contracts` for the `Sale` request — do not hand-type the cart-to-request mapping.
- `RoleGuard`/`BranchScopeGuard` are backend-enforced (Playbook §8) — this screen doesn't need to reimplement authorization, only needs to handle a 403 gracefully if it somehow occurs.

### Deliverable

An implementation plan with:
1. ≥3 options for cart state management (e.g. local component state vs. a dedicated store like Zustand vs. server-derived with optimistic updates), specifically addressing how it handles the makeable-quantity-vs-cart-contention problem above, trade-offs, recommendation.
2. Error-handling design for `InsufficientStockException` and other submit-time failures — the cart must not silently clear or double-submit on retry.
3. Test plan: multi-line cart with overlapping raw-material demand, price override interaction, submit failure recovery (Playbook §10 — this screen is high-value enough to deserve more than "light" tier despite being frontend).

Wait for human approval before writing any code.
