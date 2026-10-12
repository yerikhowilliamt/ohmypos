# Platform

**Owner module for:** `Tenant`, `PlatformAdmin`, `ImpersonationSession`
**Related:** ADR-008, ADR-011, ADR-025 (Decisions 5–8) · DEBT-010, DEBT-066 · TASK-125, TASK-126, TASK-130, TASK-131 · `docs/runbooks/platform-admin-recovery.md`

## Overview

This is the API for platform operators: the people who run OhMyPos itself, not the shops that use it. Everything here is **cross-tenant**, so it runs on `UnscopedPrismaService` rather than the tenant-filtered `PrismaService`.

| Area | Endpoints | Service |
|---|---|---|
| Platform admin auth | `POST /platform/auth/login`, `refresh`, `logout`, `GET me`, `PATCH password` | `PlatformAuthService` |
| Tenant management | `GET/POST /platform/tenants`, `GET/PATCH /platform/tenants/:id` | `PlatformTenantsService` |
| Owner recovery | `POST /platform/tenants/:id/reset-owner-password`, `PATCH /platform/tenants/:id/owner-email` | `PlatformTenantsService` |
| Impersonation | `POST /platform/tenants/:id/impersonate`, `GET …/impersonations`, `POST /platform/impersonation/end` | `ImpersonationService` |
| Dashboard | `GET /platform/metrics/overview` | `PlatformMetricsService` |

## Authentication model

Two identities never share a guard (ADR-025 Decision 5):

- The global `JwtAuthGuard` understands **tenant** tokens only.
- Platform routes carry `@Public()` to get past that guard, plus `@UseGuards(PlatformAuthGuard)` to authenticate the platform admin.

**Both decorators are required.** Without `@Public()`, every platform admin is rejected. Without `PlatformAuthGuard`, the route is **open to anyone** (DEBT-066). For that reason:

- `PlatformTenantsController` applies both at **class level**. Put new platform routes there so they inherit the guard instead of relying on someone remembering it.
- `PlatformAuthController` applies the guard per route, because `login` and `refresh` must stay unauthenticated.
- `test/platform.e2e-spec.ts` ("route protection (DEBT-066)") enumerates `PlatformModule`'s controllers and requires a 401 from every `/platform/*` route, as a safety net.

`PlatformAuthGuard` is provided by this module, not registered globally. A global platform guard would have to decide per request which identity applies, which is exactly the leak ADR-025 Decision 5 avoids.

### Platform admin sessions (`PlatformAuthService`)

This uses the same pattern as tenant `AuthService` (ADR-011 §3): dual tokens in HttpOnly cookies, rotating refresh tokens, and `tokenValidFrom` revocation. It runs against `platform_admins` with a separate key pair (`PLATFORM_JWT_SECRET`, `PLATFORM_JWT_REFRESH_SECRET`).

- **Shorter lifetimes than tenant sessions** (TASK-125), because one platform session reaches every tenant.
- **Token lifetimes are derived from the cookie max-ages**, not from env. A cookie that outlives its token produces a session that looks live but returns 401 on every call.
- **Timing-safe login:** a missing account is compared against a dummy bcrypt hash, so it takes the same time as a wrong password.
- **Rotation:** each refresh replaces the stored hash, so a stolen refresh token stops working as soon as the real holder refreshes.
- **Logout and password change bump `tokenValidFrom`.** This also invalidates outstanding access tokens, because the guard checks it on every request. The password-change response tells the caller to log in again, since the change revokes the session that made the call.
- **Throttling:** `login` and `PATCH password` allow 10 requests per 60s, the same as tenant login. This endpoint guards more than any tenant login, so it should not be more generous, and a wrong-old-password response works as a guessing oracle.
- **A forgotten platform password** cannot be recovered through the API, because nobody sits above a platform admin. Use `pnpm --filter api reset:platform-admin-password` (see the runbook).
- A missing secret env var returns `SERVER_MISCONFIGURED` and never names the variable to the caller.

## Tenant provisioning (`PlatformTenantsService.create`)

A single transaction creates the tenant, its `BusinessProfile`, its system refs (system branch and two system categories), and its first `OWNER` (ADR-025 Decision 7). A tenant missing any of these is broken from creation:

- Without system refs, `system-refs.ts` returns a 503 on the tenant's first sale and first central purchase.
- Without an `OWNER`, nobody can ever log in, because there is no self-registration.

Implementation rules:

- **The tenant id is generated in code** (`randomUUID()`), not by `@default(uuid())`, because the tenant scope (`runWithTenant`) must be open before the first scoped write.
- **Seed through the scoped `PrismaService`, not the unscoped one.** On the unscoped client, `ensureSystemRefs` would find *another* tenant's system branch by `isSystem: true` and skip creating one. The new tenant would then be unable to record its first sale, with no error at creation time. This is the one place this module injects the scoped client.
- `Tenant` is created first: it is a platform model, so the tenant extension passes it through unstamped, and every later row needs its `tenant_id` foreign key.
- The `OWNER` has `branchId: null` (ADR-011 §2).
- Slug and email are pre-checked for a precise message. The unique indexes are what actually decide under a race, and `P2002` is mapped back to the same exceptions.

**There is deliberately no delete.** Deleting a tenant would mean deleting every financial record it owns, which is why every foreign key in the schema is `Restrict`. `status: SUSPENDED` switches a tenant off: `TenantStatusGuard` stops its users mid-session, and the status change is logged. Actually erasing a tenant is an operations task done with a backup, not an HTTP DELETE.

## Owner recovery

These are a tenant's last recovery path. If its only `OWNER` loses access, nobody inside the business can help, and there is no self-registration or email reset. Both operations write through the platform admin's own session, **not** an impersonation token (impersonation is read-only).

| | Reset owner password | Change owner email |
|---|---|---|
| Use case | `OWNER` forgot their password | The operator mistyped the owner's address at provisioning, so the business cannot log in |
| Method | `POST` (setting a credential is an action) | `PATCH` (it edits one field) |
| Throttle | 5 per 60s | 5 per 60s |
| Revokes sessions | Yes | Yes (the old address may belong to someone else) |
| Extra gate | — | Non-pristine tenant requires `acknowledgeExistingData: true` |
| Log (`warn`) | operator, tenant, target, **reason** (never the password) | operator, tenant, target, **old and new email**, pristine flag, evidence, reason |

Both endpoints return **one 404 message** for "no such user", "another tenant's user" and "not an `OWNER`", so a caller who named the wrong row learns nothing about it.

**Email uniqueness is global across tenants** (ADR-025 Decision 6). The `OwnerEmailTakenException` message says so, so the operator does not search the wrong tenant.

### Pristine check (`tenant-data-check.ts`)

Changing the owner email on a tenant that is already trading hands someone the login of a live business. The tenant is therefore measured first. This is a speed bump by design, not a wall: the operator can proceed, but only after reading what they are acting on.

Provisioning leaves exactly one `Tenant`, one `BusinessProfile`, one system `Branch`, two system `Category` rows and one `OWNER`. Those are **not** evidence of use, so the counts use a baseline:

| Count | Baseline | Label (Indonesian, shown to the operator) |
|---|---|---|
| `sales`, `ledgerEntries`, `bankTransactions`, `supplierPurchases`, `products`, `rawMaterials`, `suppliers`, `accounts`, `devices` | 0 | `penjualan`, `catatan kas`, … |
| `nonSystemBranches` (system branch excluded) | 0 | `cabang` |
| `users` (the provisioned `OWNER` included) | 1 | `pengguna tambahan` |

The evidence is ordered most-alarming first, so an operator who reads only the first item sees the strongest argument against the change. Counts are used rather than `findFirst`, because "3 penjualan" tells the operator more than "ada data". The queries run outside `runWithTenant`, so each one filters `tenantId` explicitly.

## Impersonation (`ImpersonationService`)

ADR-025 Decision 8: **30 minutes, no refresh token, read-only, and every session recorded with a reason.**

- The token acts as the tenant's **oldest active `OWNER`**, the account created with the tenant. A tenant with no active owner returns 409 `TenantHasNoActiveOwnerException`.
- It is signed with the **tenant** secret, because it is presented to ordinary tenant endpoints and verified by `JwtAuthGuard`. The `imp` claim is what `ImpersonationReadOnlyGuard` checks to block writes.
- The audit record and log line are written **before** the token is minted, so a crash in between leaves a record with no session rather than a session with no record.
- **The TTL is not configurable by env.** An operator who needs longer starts a second session, which produces a second audit record, and that is the behaviour worth encouraging.
- `end` closes only the **caller's own** most recent session. Ending someone else's would blank an audit record another operator is still writing.
- **There is no token revocation.** The token lives until expiry, because a revocation list would add a database read to every tenant request. A 30-minute, read-only bound is what makes that acceptable (TASK-126).

## Metrics (`PlatformMetricsService`)

Counts plus one indexed aggregate over `sales`, computed at query time (ADR-008). If this endpoint ever becomes slow, revisit ADR-008 for the platform layer; do not add a cache here. Revenue here and in tenant detail **excludes `VOIDED` sales**, matching every tenant report (DEBT-010), and is serialized with `toFixed(2)` so the column's scale reaches the client.

## Errors

All messages are in Indonesian and end with the action that resolves them (the rules in `common/messages.ts`).

| Exception | HTTP | Raised when |
|---|---|---|
| `TenantSlugTakenException` | 409 | Slug already used by another tenant |
| `OwnerEmailTakenException` | 409 | Email used by any user in any tenant |
| `TenantHasDataUnacknowledgedException` | 409 | Owner email change on a non-pristine tenant without acknowledgement. The message lists the evidence |
| `TenantHasNoActiveOwnerException` | 409 | Impersonation with no active `OWNER` to act as |
| `TenantNotFoundException` | 404 | Unknown tenant id |
| `ImpersonationSessionNotFoundException` | 404 | No open session to end |

## Testing

| Layer | File | Covers |
|---|---|---|
| Unit | `tenant-data-check.spec.ts` | Baseline exclusions: a freshly provisioned tenant is pristine |
| E2E | `test/platform.e2e-spec.ts` | Every `/platform/*` route returns 401 without a platform session (DEBT-066); provisioning, suspension, impersonation, owner recovery |

## History

| When | Change |
|---|---|
| ADR-025 phase 4 | Platform console API: auth, tenants, metrics, impersonation |
| TASK-125 | Shorter platform token lifetimes |
| TASK-126 | Impersonation hand-off; no revocation list, by decision |
| TASK-130 | Platform admin password change; reset tenant owner password |
| TASK-131 | Change tenant owner email with the pristine check |
