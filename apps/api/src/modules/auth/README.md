# Auth (tenant users)

**Owner module for:** tenant login sessions and self-service profile
**Related:** ADR-011, ADR-020, ADR-025 · ERD §7 · TASK-130, TASK-132 · `common/README.md` (guards, cookies, tenant scope)

## Overview

| Endpoint | Access | Notes |
|---|---|---|
| `POST /auth/login` | `@Public()`, 10 per 60s | Sets `access_token` / `refresh_token` cookies |
| `POST /auth/refresh` | `@Public()` | Rotates both tokens |
| `POST /auth/logout` | authenticated | Revokes every session |
| `GET /auth/me` | authenticated | Profile plus `tenantStatus`; reachable even when the tenant is suspended |
| `PATCH /auth/me` | authenticated | Self-service name change only (email is not self-service) |
| `PATCH /auth/password` | authenticated | Requires the **old** password; revokes every session |
| `POST /auth/me/photo` | authenticated | Profile photo upload |
| `PATCH /auth/deactivate` | authenticated | Self-service soft deactivation ("Hapus Akun Saya") |

**There is no `register` endpoint.** User creation is `OWNER`-only through `POST /users` (ADR-011), and Kasync's public self-registration is exactly what that ADR rules out (ERD §7).

## Sessions (ADR-011)

- Access and refresh JWTs in HttpOnly cookies (lifetimes and cookie rules in `common/README.md`).
- **Refresh rotation:** each refresh replaces the stored refresh hash, so a stolen refresh token stops working as soon as the legitimate holder refreshes once.
- **Revocation through `tokenValidFrom`.** Logout, password change and deactivation bump it, which also kills already-issued access tokens, because `JwtAuthGuard` checks it on every request.
- **Timing-safe login:** a missing account is compared against a dummy bcrypt hash, so it takes the same time as a wrong password. The error never says *which* of email or password is wrong, since that would reveal which emails exist.
- **Tenant lookup at login (ADR-025).** `login` and `refresh` are `@Public()`, so no guard has run and no tenant is in scope. The user lookup that *finds* the tenant uses `UnscopedPrismaService`; everything after `adoptTenantScope` uses the scoped client. `User.email` is globally unique (Decision 6), which is why the login page needs no tenant selector.
- **Device tracking is `KASIR`-only.** `ADMIN`/`OWNER` are not branch-scoped, so a device is meaningless for them.
- `expiresIn` is cast, because its type is a narrowed literal union that an env-var string cannot satisfy (same as Kasync).

## `GET /auth/me` and suspended tenants (TASK-132)

`TenantStatusGuard` exempts this route, which makes it the one authenticated endpoint a suspended tenant's user can reach, and therefore the only place the frontend can learn *why* nothing else works. It returns the user's own identity plus `tenantStatus`, and no business data. The tenant row is read unscoped (`Tenant` is a platform model). A missing tenant row must never be reported as `ACTIVE`.

## Self-service deactivation

This is a soft deactivation only (`Sale.userId` is an audit trail, ERD §7). Unlike `UsersService.deactivate`, it needs one more guard: an `OWNER` deactivating *someone else* can never remove the last active `OWNER`, but deactivating *themselves* can. That case throws `LastActiveOwnerException`. Without it, nobody would be left to create or manage staff.

## Profile photo (`ProfilePhotoService`, ADR-020)

Uploads go to Cloudinary under a deterministic public id `ohmypos/users/<userId>` with overwrite, so there is one image per user with no photo history. This is a deliberate v1 simplification, and the resulting `secure_url` is stored on `User.photoUrl`.

## Testing

| File | Covers |
|---|---|
| `test/auth-rbac.e2e-spec.ts` | Login, refresh rotation, revocation, role and branch enforcement |
