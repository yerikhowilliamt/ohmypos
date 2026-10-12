# ADR-011: Authentication & Role-Based Access Control (Kasir / Admin / Owner)

**Status:** Accepted — **partially superseded by ADR-025** (only the "no multi-tenant Business layer" decision and its matching rejected alternative; the role model, `branchId` rule, JWT/`tokenValidFrom` pattern, and Owner-only user creation are unchanged)

**Context:** OhMyPos is single-tenant (one business), but requires staff-level login with three distinct roles: Kasir, Admin, Owner. Kasync's own Auth module was audited via its state export (kasync-state-export.md) and found to have added multi-tenant user isolation late, outside its original PRD — a drift OhMyPos avoids by deciding Auth scope upfront as its own ADR, before implementation.

Unlike Kasync, OhMyPos has no Business entity — all staff belong to the same business, differentiated only by role and branchId.

**Decision:** 
1. User.role is enum(KASIR, ADMIN, OWNER) — extends the ERD's existing User entity (previously drafted as OWNER, CASHIER only; ADMIN added here, CASHIER kept as-is to match ERD naming).
2. User.branchId (already in ERD, nullable) — required when role = KASIR, null when role = ADMIN or OWNER (unscoped, all-branch access).
3. Auth pattern ported from Kasync: JWT access + refresh token, password hash, tokenValidFrom for session revocation on logout/credential change.
4. Two guards combine to enforce access: a RoleGuard (checks role against endpoint's allowed roles) and an extended BranchScopeGuard (System Design Section 8) — if role = KASIR, every request is scoped to user.branchId; Admin/Owner bypass branch scoping.
5. Only OWNER can create/deactivate User records — no self-registration, no approval workflow (Admin cannot create users).
6. Reconciliation matching (Allocation create/revoke) is restricted to ADMIN and OWNER via the same RoleGuard.
7. Sale.userId (already in ERD as "cashier who made the sale") satisfies the audit requirement of recording which staff member processed each sale — no separate processedByUserId field needed.

**Consequences:**

- (+) No multi-tenant Business layer needed — matches OhMyPos's confirmed single-business scope.
- (+) Kasync's proven Auth pattern (JWT + tokenValidFrom) is reused directly, lowering implementation risk.
- (+) Sale.userId already provides per-sale staff accountability without schema changes.
- (−) branchId nullability requires strict discipline in BranchScopeGuard — every Kasir-facing endpoint touching Sale, StockMovement, or branch-scoped LedgerEntry reads must apply it, not just some.
- (−) Owner-only user creation is a single point of failure for staff onboarding — accepted given the small-team scale of a single business.

**Alternatives considered:**

* Admin can create users with Owner approval workflow: considered, then rejected in favor of simpler Owner-only creation — no pending-approval state or notification infrastructure needed.
* Multi-tenant Business entity for future resale: rejected — OhMyPos is confirmed single-business; adding this now would repeat Kasync's own late-multi-tenancy drift problem in reverse (building for a hypothetical need not yet real).
