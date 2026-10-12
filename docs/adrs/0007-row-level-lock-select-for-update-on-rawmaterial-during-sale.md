# ADR-007: Row-level lock (`SELECT ... FOR UPDATE`) on `RawMaterial` during sale-time stock decrement

**Status:** Accepted

**Context:** Stock is a single shared pool across all branches (ADR-004). Multiple branches can sell products consuming the same raw material concurrently, creating a race condition if two sales read-then-write the stock balance without synchronization — this is the same class of problem Kasync solved for its allocation-sum trigger.

**Decision:** Before decrementing `RawMaterial.currentStock` inside the `Sale` creation transaction, take a row-level lock on the raw material row (`SELECT ... FOR UPDATE`), mirroring the fix already applied in Kasync's allocation trigger.

**Consequences:**

- Correct stock balances under concurrent sales from different branches, at the cost of some lock contention on hot raw materials.
- Acceptable at the business's actual transaction volume (flagged as a risk to revisit in System Design Section 11 if volume grows significantly).

**Alternatives considered:**

- _Optimistic concurrency (version column, retry on conflict)_: rejected for v1 — adds retry-handling complexity in the `Sale` flow for a problem the simpler pessimistic lock already solves at this scale.
- _No locking (accept the race)_: rejected outright — stock and financial accuracy are core goals (PRD Section 3), not areas to cut corners on.
