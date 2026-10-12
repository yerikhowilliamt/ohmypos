# ADR-003: Continue using Prisma as the ORM

**Status:** Accepted

**Context:** Kasync uses Prisma over Sequelize/TypeORM, originally chosen partly to showcase a skill not otherwise on the author's CV. OhMyPos ports Kasync's modules directly, including their Prisma schema definitions and migration patterns (e.g. the allocation-sum trigger, the `FOR UPDATE` lock pattern).

**Decision:** OhMyPos uses Prisma, matching Kasync.

**Consequences:**

- Ported modules can be adapted with minimal friction — same schema conventions, same migration tooling, same query patterns for row-locking.
- Consistency across both portfolio projects reinforces the same skill demonstration Kasync's own ADR was aiming for.

**Alternatives considered:**

- _Switch ORMs for OhMyPos_: rejected — would mean re-deriving the trigger-based allocation-sum constraint and the `FOR UPDATE` lock pattern in a different ORM's idioms, for no functional benefit.
