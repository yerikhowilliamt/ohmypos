# ADR-001: OhMyPos is a new repo that ports Kasync's module patterns, rather than extending Kasync or calling it via API

**Status:** Accepted

**Context:** Kasync is a standalone, ~99%-complete reconciliation engine, already positioned as an independent portfolio piece. OhMyPos needs the same financial primitives (`Account`, `LedgerEntry`, `Allocation`, `MatchingEngine`) plus new POS-specific domains, and `Sale` creation needs to atomically touch both stock and ledger state.

**Decision:** OhMyPos is built as a new, separate repository. Kasync's modules are copied and adapted into it directly (not called over HTTP), while Kasync itself is left running and deployed unchanged.

**Consequences:**

- Kasync remains a clean, standalone portfolio artifact — its scope and story don't get diluted by becoming "a module inside someone's POS system."
- `Sale` creation can wrap stock + ledger writes in one database transaction (see ADR-007), avoiding a distributed-transaction problem entirely.
- Trade-off: some code duplication between Kasync and OhMyPos for the ported modules — accepted as a small cost for a small, single-developer scope.

**Alternatives considered:**

- _Extend Kasync in place_: rejected — conflates a single-tenant portfolio piece with a business-specific POS app, and risks the two use cases pulling the schema in different directions over time.
- _Separate OhMyPos service calling Kasync's API_: rejected — turns every sale into a distributed transaction (partial failure, retries, idempotency) for no real benefit at this scale.
