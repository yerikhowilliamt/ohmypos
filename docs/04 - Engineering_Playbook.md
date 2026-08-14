# OhMyPos — Engineering Playbook

**Status:** Draft v2
**Depends on:** PRD v1, System Design v2, ADR-001–011, ERD v2
**Relationship to Kasync:** This playbook adapts Kasync's Engineering Playbook v1.0 — the philosophy, exception pattern, and PII/logging rules are carried over unchanged where they still apply; sections are added or revised where the monorepo, Zod, and new domains require it.

**Changelog (v1 → v2):** Section 8 revised for the three-role model (`KASIR`, `ADMIN`, `OWNER`) per ADR-011 — previously only referenced `CASHIER`/`OWNER`. Added `RoleGuard` alongside the existing `BranchScopeGuard`, and explicit rules for user creation and reconciliation-matching permissions.

---

## 1. Purpose

This is the day-to-day engineering rulebook for building OhMyPos — how modules are structured, how money/stock correctness is enforced, what "done" means, and when a decision is significant enough to need its own ADR. It assumes the reader has already read the PRD, System Design, ADRs, and ERD.

## 2. Monorepo Conventions

- Workspace layout as defined in System Design Section 2: `apps/api`, `apps/web`, `packages/api-contracts`, `packages/ui`, `packages/config`.
- Every new backend module gets its own folder under `apps/api/src/modules/<module-name>` — controller, service, repository (if the ORM layer needs one beyond Prisma directly), and a `*.exceptions.ts` file for domain exceptions (Section 6).
- Every schema in `packages/api-contracts` is named after the resource it validates (e.g. `sale.schema.ts`, `raw-material.schema.ts`) and exports both the Zod schema and its inferred type — this is the only place a request/response shape is defined (ADR-010).
- Turborepo task graph: `lint`, `typecheck`, `test`, `build` must be runnable both per-package (`turbo run test --filter=api`) and across the whole repo (`turbo run test`) — CI always runs the whole-repo version.

## 3. Domain Structure & Philosophy

Carried over from Kasync: each module owns its domain logic behind a service layer; controllers stay thin (parse request → call service → return response); cross-module calls go through a module's public service interface, never by reaching into another module's repository or Prisma model directly. This is what keeps the ported-modules-never-depend-on-new-modules rule (System Design Section 1) enforceable in practice, not just on paper.

New domains follow the same shape as the ported ones — e.g. `SaleService` is structured the same way `AllocationService` is in Kasync, not reinvented.

## 4. Validation — Zod Everywhere (ADR-010)

- Every controller input is validated against a Zod schema from `packages/api-contracts` before it reaches a service. No `class-validator` decorators on new DTOs.
- Every frontend form uses the same schema for client-side validation. A validation rule is written once, in one file, in `packages/api-contracts` — if a rule needs to change, it changes in exactly one place.
- Schema changes are backward-compatibility-aware: loosening a schema (making a field optional) is safe; tightening it (new required field, stricter enum) requires checking both `apps/api` and `apps/web` are updated together in the same change, since they share the schema directly.

## 5. Money & Quantity Handling

- All monetary and quantity values are `Decimal` end to end — Prisma schema, service layer, Zod schemas (`z.string().refine(...)` or a decimal-safe custom type, never `z.number()` for money) — floating point is never used for anything that represents currency or stock quantity.
- Every value that crosses the Zod boundary as a string-encoded decimal is parsed back into a `Decimal` before any arithmetic — never do arithmetic on the raw string or a coerced `number`.

## 6. Domain Exception Pattern

Carried over from Kasync: each module defines its own exception classes extending a shared `DomainException` base, mapped to HTTP status codes at the boundary (not scattered `throw new BadRequestException(...)` calls inside services). New exceptions specific to OhMyPos's domains include (non-exhaustive — add as needed, following the same pattern):

- `InsufficientStockException` (raised when a sale would drop `RawMaterial.currentStock` below zero)
- `PayableAlreadySettledException`
- `PriceOverrideNotPermittedException` (if role-based restrictions on manual price override are added later)
- `RecipeIncompleteException` (a product has no recipe defined, so HPP can't be computed)
- `UnauthorizedUserCreationException` (raised if a non-`OWNER` role attempts to create a `User` — see Section 8)

## 7. Transaction Boundaries

Rule: **any operation that writes to more than one of {`LedgerEntry`, `StockMovement`, `Payable`} happens inside exactly one Prisma `$transaction`.** This is not a style preference — it's the mechanism that makes ADR-004 (branch attribution), ADR-006 (settlement timing), and ADR-007 (stock concurrency) actually hold at runtime. Concretely:

- `Sale` creation → one transaction (System Design 6.1).
- `SupplierPurchase` creation → one transaction (System Design 6.2).
- `PayableSettlement` creation → one transaction (System Design 6.3).

Before decrementing `RawMaterial.currentStock`, always take the row lock first (`SELECT ... FOR UPDATE`) per ADR-007 — this is a required step, not an optimization to add later if problems show up.

## 8. Branch Scoping & Role Enforcement (ADR-011)

Two guards run together on every relevant endpoint — never rely on one alone:

- **`RoleGuard`** — checks `User.role` against the endpoint's allowed roles. Concretely:
  - `POST /users` (create user) — `OWNER` only. `ADMIN` and `KASIR` are rejected outright; there is no approval-request flow, this is a hard restriction.
  - `Allocation` create/revoke (reconciliation matching) — `ADMIN` and `OWNER` only. `KASIR` is rejected.
  - All other endpoints default to allowing any authenticated role unless explicitly restricted.
- **`BranchScopeGuard`** — for `role = KASIR`, rejects any request whose `branchId` doesn't match the user's own `User.branchId`. For `role = ADMIN` or `OWNER`, passes through unscoped (both have all-branch access; the ADR does not distinguish between them for branch scope, only for the specific actions listed above).

Both checks happen in `apps/api`, never rely on the frontend hiding a UI element — the frontend's role-based routing (System Design Section 5) is a UX convenience, not a security boundary.

## 9. Logging & PII Rules

Carried over from Kasync unchanged: no PII (customer names, contact info, raw payment details) in log lines; structured logging with correlation IDs; log the entity ID and operation, not the full payload, for anything touching `LedgerEntry`, `Payable`, or `Sale`.

## 10. Testing Approach

Carried over from Kasync's revised approach (away from "100% coverage" as a goal): coverage follows risk, not a blanket percentage.

- **Must have thorough tests**: the `Sale` creation flow (HPP snapshot, stock decrement, ledger creation, rollback-on-failure), the `Payable`/`PayableSettlement` flow, the `Allocation` sum constraint, `BranchScopeGuard`, `RoleGuard` (especially the `OWNER`-only user creation path and `ADMIN`/`OWNER`-only reconciliation path).
- **Should have tests**: standard CRUD on master data modules (`Product`, `RawMaterial`, `Supplier`).
- **Can rely on type-checking + light tests**: purely presentational frontend components with no business logic.

## 11. API Documentation

Swagger/OpenAPI is generated from `apps/api`, same as Kasync. Since request/response shapes now come from Zod (ADR-010) rather than `class-validator` DTOs, Swagger generation uses a Zod-to-OpenAPI bridge (e.g. `@asteasolutions/zod-to-openapi`) rather than NestJS's default decorator-based Swagger generation — this keeps `packages/api-contracts` as the single source of truth instead of requiring separate `@ApiProperty()` annotations that could drift from the Zod schema.

## 12. Dependency Security

Same baseline as Kasync: `pnpm audit` run in CI, dependency updates reviewed before merge, no dependency added without checking it's actively maintained.

## 13. Pre-Commit Rules

- Lint + format (via `packages/config`'s shared ESLint/Prettier config) across whichever workspace(s) changed.
- Type-check must pass across the whole repo (a `packages/api-contracts` change can break both `apps/api` and `apps/web` — pre-commit must catch that before it reaches CI).

## 14. CI Pipeline

1. Install (pnpm, cached).
2. `turbo run lint typecheck test build` across the whole repo.
3. `pnpm audit`.
4. On merge to main: build and push `web` and `api` images.

## 15. Definition of Done

A change is done when:
- It has tests appropriate to its risk level (Section 10).
- Any change to a Zod schema in `packages/api-contracts` has been checked against both `apps/api` and `apps/web` usage.
- Any change touching `LedgerEntry`, `StockMovement`, or `Payable` together has been verified to happen inside one transaction (Section 7).
- Any change touching an endpoint's access rules has `RoleGuard` and/or `BranchScopeGuard` verified, not assumed (Section 8).
- Swagger docs reflect the change (auto-generated, but verify it rendered correctly).
- Self-review checklist (Section 16) has been run.

## 16. Self-Review Checklist

- [ ] Does this change cross a module boundary correctly (through a service interface, not a direct repository/Prisma reach-through)?
- [ ] If this touches money or stock, is it inside a transaction, and is the `RawMaterial` row-lock present where required?
- [ ] Is `branchId` handled correctly — required where it should be, nullable where centralization applies (ADR-004), and enforced by `BranchScopeGuard` on writes?
- [ ] If this endpoint should be role-restricted (user creation → `OWNER` only; reconciliation matching → `ADMIN`/`OWNER` only), is `RoleGuard` actually applied, not just assumed from the frontend?
- [ ] Did this change require updating a Zod schema? If so, are both `apps/api` and `apps/web` updated in the same PR?
- [ ] Does this change need its own ADR (Section 17)?

## 17. ADR Trigger Criteria

Carried over from Kasync: write a new ADR when a decision is hard to reverse, affects more than one module, or changes a previously-documented decision (in which case, mark the old ADR "Superseded," don't delete it — see ADR-009/ADR-010/ADR-011 for the pattern). Small implementation details that don't meet this bar (e.g. exactly which NestJS-Zod integration library to use, per ADR-010's own note) don't need one.

## 18. Naming Conventions

- Backend: NestJS standard (`*.controller.ts`, `*.service.ts`, `*.module.ts`), domain exceptions as `*.exceptions.ts`.
- Zod schemas in `packages/api-contracts`: `<resource>.schema.ts`, PascalCase exported schema names (e.g. `SaleSchema`), inferred types suffixed `Type` only where the schema name alone would be ambiguous with the Prisma model name.
- Frontend: route groups as defined in System Design Section 5, component files colocated with the route unless shared via `packages/ui`.
- Database: snake_case table/column names (Prisma's default mapping from camelCase models), consistent with Kasync's existing convention.
- Roles: always `KASIR`, `ADMIN`, `OWNER` in code, docs, and UI copy — do not reintroduce `CASHIER` (the v1-draft ERD's original naming, superseded by ADR-011).