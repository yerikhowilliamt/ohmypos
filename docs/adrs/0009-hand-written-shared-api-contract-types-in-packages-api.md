# ADR-009: Hand-written shared API contract types in `packages/api-contracts` (not code-generated, for now) — Superseded by ADR-010

**Status:** Accepted, provisional

**Context:** The monorepo (ADR-002) needs a single source of truth for request/response shapes shared between `apps/api` and `apps/web`, to prevent type drift.

**Decision:** Start with hand-written TypeScript types in `packages/api-contracts`, manually kept in sync with the NestJS DTOs.

**Consequences:**

- Zero extra build tooling to get started; fast to set up for v1.
- Relies on developer discipline to keep the shared types in sync — acceptable risk for a single-developer project, but explicitly flagged (System Design Section 11) as something to revisit.

**Alternatives considered:**

- _Generate types from the NestJS OpenAPI spec (e.g. `openapi-typescript`)_: deferred, not rejected — a reasonable v2 upgrade once the API surface stabilizes enough that regenerating shared types isn't premature. Adopting it later should get its own ADR, since it changes the build pipeline.
