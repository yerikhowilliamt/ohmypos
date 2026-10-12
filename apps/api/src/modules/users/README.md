# Users (staff administration)

**Owner module for:** `User` management by the tenant `OWNER`
**Related:** ADR-011 · ERD §2, §7 · TASK-130 · Playbook §9

## Overview

**`OWNER` only, with no exceptions and no approval workflow** (ADR-011). `@Roles('OWNER')` is applied at **class level**, so a route added later inherits it instead of defaulting to open. Do not build an `ADMIN`-initiates / `OWNER`-approves flow without a new ADR.

| Endpoint | Effect |
|---|---|
| `POST /users` | Create a staff user |
| `GET /users`, `GET /users/:id` | List and read |
| `PATCH /users/:id` | Update name, role or branch |
| `PATCH /users/:id/deactivate`, `/reactivate` | Soft state change |
| `PATCH /users/:id/password` | `OWNER` sets a staff member's password (10 per 60s) |

## Rules

- **Role ↔ branch (ADR-011):** `branchId` is **required for `KASIR`** and **forbidden for `ADMIN`/`OWNER`**, otherwise `InvalidRoleBranchAssignmentException`. Zod checks it too, but it is a domain invariant, so the service enforces it for every caller. On `PATCH`, the **merged** state is validated, not only the fields sent. Otherwise a promotion to `ADMIN` could leave a stray `branchId`, or a branch change could null out a `KASIR`'s required branch.
- **Email is globally unique** across tenants (ADR-025 Decision 6): `EmailAlreadyRegisteredException`.
- **`tokenValidFrom` is written from the application clock**, not the column default. `JwtAuthGuard` compares it with the JWT `iat` issued by Node, and mixing the two clocks is what forced Kasync's skew tolerance.
- **Deactivation is never a delete.** `Sale.userId` is an audit trail that must survive a staff member leaving. Deactivation bumps `tokenValidFrom`, ending the user's sessions immediately.
- Responses never include `passwordHash` or `refreshTokenHash` (Playbook §9).

## Password reset by the OWNER (TASK-130)

- **An `OWNER` can never reset their own password here.** `PATCH /auth/password` requires the *old* password precisely so that a stolen session is not enough to take over an account. If an `OWNER` could reset themselves here, a session thief would call it on their own id and lock out the real owner.
- `actorId` comes from the authenticated request, not a re-read, so the guard checks the identity the auth guard actually verified.
- The target is read through `findOne`, so the 404 matches other endpoints and tenant scoping applies.
- The reset clears `refreshTokenHash` and bumps `tokenValidFrom`, so the staff member's old sessions die.
- Only ids are logged, never the password in any form.

## Testing

| File | Covers |
|---|---|
| `test/user-branch-management.e2e-spec.ts` | Role/branch rules, deactivation, password reset |
| `test/auth-rbac.e2e-spec.ts` | `OWNER`-only access |
