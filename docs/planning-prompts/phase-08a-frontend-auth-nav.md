# Planning Prompt — Phase 8a: Frontend — Auth/Nav Infra

**Intended model:** Sonnet
**Depends on:** Phase 2 (Auth & RBAC backend) — done
**Blocks:** nothing functionally, but should land first — every other frontend screen sits inside this shell (nav, session handling)

---

## Prompt (paste into a fresh session)

You are generating an **implementation plan** for OhMyPos frontend — do not write code yet.

First read: `AGENTS.md`, `docs/04 - Engineering_Playbook.md`, `docs/01 - System_Design.md` §5 (frontend routing/role rules), `docs/DESIGN.md` (design tokens — reference, not spec), `docs/07 - Task_Log.md` TASK-004's handoff notes (these name the exact gaps this phase closes).

**AGENTS.md governance applies in full**: ≥3 implementation options where genuine choices exist; no unrelated refactors; no Git writes.

### Scope

Close the frontend gaps explicitly flagged in TASK-004's handoff — currently only route gating + login exist:
- **Logout control** — no UI exists yet.
- **Token-refresh-on-401 interceptor** — currently nothing retries a request after silent token refresh; a 401 just fails.
- **Inter-page navigation** — a real nav/sidebar shell reflecting the role-based route access already enforced by middleware (`docs/01 - System_Design.md` §5: KASIR → `(pos)/sales` only; ADMIN → master-data + reconciliation only; OWNER → full `(back-office)/*`). The nav should only *show* links a role can access — remember backend guards are the real enforcement (AGENTS.md item 3), this is UX only.

### Constraints

- Follow existing patterns in `apps/web/app` (route groups already exist: `(pos)/sales`, `(back-office)/{reconciliation,expenses,master-data,inventory,users,reports}`, `login/`) — don't restructure routing, just build the shell around it.
- Use `packages/ui` components where they already exist; extend rather than duplicate.
- Zod schemas for any new request/response shapes (e.g. refresh endpoint) belong in `packages/api-contracts`, per ADR-010.

### Deliverable

An implementation plan with:
1. ≥3 options for the refresh-on-401 interceptor (e.g. fetch wrapper vs. React Query/SWR middleware vs. server-side proxy), trade-offs, recommendation.
2. Nav/shell component structure, keyed off the already-established role-based route groups.
3. Light test plan (Playbook §10 marks presentational components as "light" tier, but the interceptor and role-based nav-visibility logic deserve real tests).

Wait for human approval before writing any code.
