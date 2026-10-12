# ADR-002: Monorepo with Next.js frontend decoupled from the NestJS backend via REST

**Status:** Accepted

**Context:** OhMyPos needs both a backend (financial/inventory logic) and a frontend (POS + back-office UI). Kasync already established a precedent: a Next.js frontend that consumes its NestJS API purely over REST, with no backend logic in Next.js API routes (Kasync ADR-007).

**Decision:** OhMyPos is a single monorepo (`apps/api`, `apps/web`, shared `packages/*`), using pnpm workspaces + Turborepo. The frontend calls the backend only over REST, using shared types from `packages/api-contracts`. The frontend never accesses the database directly.

**Consequences:**

- One repo, one place to review the whole feature end-to-end, one CI pipeline — appropriate for a single developer.
- Backend business logic (transactions, locking, validation) stays in one place (`apps/api`) and can't be bypassed by the frontend.
- Requires discipline to keep `packages/api-contracts` in sync with the backend (tracked as a risk in System Design — see ADR-008 below for the mitigation path).

**Alternatives considered:**

- _Two separate repos (frontend, backend)_: rejected — adds repo-management overhead with no benefit for a single-developer project; Kasync's own frontend/backend split didn't require separate repos either.
- _Next.js API routes as the backend_: rejected — would duplicate business logic across two places or force the "real" backend logic into Next.js, contradicting the modular-monolith design already decided for the domain logic.
