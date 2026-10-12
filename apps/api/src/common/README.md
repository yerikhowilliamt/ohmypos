# Common (API infrastructure)

**Covers:** authentication and authorization guards, tenant isolation, error handling, report periods, system references, user-facing messages
**Related:** ADR-010, ADR-011, ADR-014, ADR-018, ADR-025 · Playbook §4, §8, §9 · DEBT-066 · ERR-046

Every module depends on this folder. `common/` must never import from `modules/`.

## Request pipeline

Middleware always runs before guards. Global guards run **in the order of the `APP_GUARD` array in `app.module.ts`**, and that order is load-bearing.

| # | Stage | What it does |
|---|---|---|
| 1 | `TenantScopeMiddleware` | Opens an empty `AsyncLocalStorage` scope `{ tenantId: null, platformAdminId: null }` |
| 2 | `CorrelationIdMiddleware` | Reads or generates `x-correlation-id` and echoes it on the response, so a caller can quote it when reporting an error |
| 3 | `ThrottlerGuard` | 100 requests/60s per IP (`THROTTLE_LIMIT` is raised only in `.env.test` for the concurrency suite) |
| 4 | `JwtAuthGuard` | Authenticates the tenant user and **fills the tenant scope** |
| 5 | `ImpersonationReadOnlyGuard` | Impersonation tokens: `GET` only |
| 6 | `TenantStatusGuard` | Blocks users of a `SUSPENDED` tenant |
| 7 | `RoleGuard` | Enforces `@Roles(...)` |
| — | `ZodValidationPipe` | Validates every body and query against its `api-contracts` schema (ADR-010) |
| per route | `BranchScopeGuard`, `PlatformAuthGuard` | Opt-in, via `@UseGuards` |

`ImpersonationReadOnlyGuard` **must** run before `TenantStatusGuard`, because the latter's impersonation exemption is only safe once the token has been reduced to `GET`.

### `JwtAuthGuard` (global)

Every endpoint is authenticated unless it opts out with `@Public()`, so an endpoint added without thought fails **closed**.

1. Reads the token from the `access_token` cookie, or `Authorization: Bearer`.
2. Verifies it with `JWT_SECRET`. A missing secret returns `SERVER_MISCONFIGURED` and never names the variable.
3. Loads the user row (unscoped, because this guard is what establishes the tenant):
   - not found → 401, `isActive = false` → 401 `ACCOUNT_DEACTIVATED`;
   - **revocation:** reject if `iat × 1000 + 1000 ≤ tokenValidFrom`. The 1000ms is the resolution of `iat` (whole seconds), not clock-skew slack: a token minted at 10:00:00.900 carries `iat = 10:00:00` and must survive a `tokenValidFrom` of 10:00:00.500. Kasync used 2000ms to also absorb Node/Postgres clock drift. That is unnecessary now, because every write of `tokenValidFrom` comes from the application clock. The trade-off: a token minted in the same second as a logout may survive it.
4. **Role, branch and tenant come from the database, not the token**, so a role change, branch move or deactivation takes effect immediately.
5. Sets `scope.tenantId = user.tenantId` (ADR-025 Decision 2: the tenant is never sent by the client). If no scope is open (the middleware did not run), it fails closed.

### `RoleGuard` (global)

This is the authoritative role check; the frontend's role-based routing is a UX convenience and is never trusted (System Design §5). With no `@Roles(...)`, any authenticated role is allowed. Modules repeat `@Roles` on each handler so that `grep -rn "@Roles"` is a complete access inventory.

### `BranchScopeGuard` (opt-in)

This guard confines a `KASIR` to their own branch on endpoints marked `@BranchScoped('body.branchId' | 'query.branchId' | 'params.branchId' | 'params.id')`. `ADMIN` and `OWNER` pass unscoped (ADR-011).

- The decorator **names where the branch id lives**. A guard that scanned the request for any `branchId` could not tell "this endpoint has no branch" from "the branch field was forgotten", and would let the second case through.
- **A missing branch id is rejected (403), never defaulted.** An earlier version injected the cashier's branch into `req.query`, but Express 5 exposes `req.query` as a getter, so the write silently did nothing and the request ran unscoped. A cashier could see every branch.
- A `KASIR` with no `branchId` is rejected rather than falling through to unscoped access.

### `ImpersonationReadOnlyGuard` (global)

When the token carries an `imp` claim, only `GET` passes (ADR-025 Decision 8). It is global because an impersonation token is presented to *ordinary* tenant endpoints: with per-route opt-in, the route that forgot would be the writable hole. `HEAD` is blocked too, which is harmless but kept, because changing the allowed method set requires a new ADR.

### `TenantStatusGuard` (global)

A suspended tenant's users can authenticate but cannot use the app. Exemptions:

| Request | Why |
|---|---|
| `POST /auth/logout` | A user suspended mid-session must be able to end it cleanly |
| `GET /auth/me` | Without it the frontend cannot tell "signed out" from "suspended", and bounced owners to the login page in a loop (TASK-132). It returns only the caller's identity and `tenantStatus` |
| Impersonation sessions | An operator investigating *why* a tenant was suspended needs to read its books. Safe, because the token is already `GET`-only |

Matching uses **method and path**: `PATCH /auth/me` must stay blocked.

### `PlatformAuthGuard` (opt-in)

This is the platform-console counterpart of `JwtAuthGuard`, with the same checks in the same order, against `platform_admins` and `PLATFORM_JWT_SECRET`. It sets `scope.platformAdminId` but **leaves `tenantId` null**, so a platform route that touches a tenant model through the scoped client throws instead of reading some tenant.

> **Fail-open shape (DEBT-066).** Platform routes are `@Public()` to get past `JwtAuthGuard`. A `@Public()` platform route **without** `@UseGuards(PlatformAuthGuard)` is an unauthenticated endpoint over cross-tenant data, and nothing at compile time catches it. The safety net is the "route protection (DEBT-066)" case in `test/platform.e2e-spec.ts`, which enumerates every `/platform/*` route and requires a 401. See the Platform README.

### Tokens and cookies

| Session | Cookies | Lifetime (access / refresh) | Secret |
|---|---|---|---|
| Tenant | `access_token`, `refresh_token` | 1 day / 30 days | `JWT_SECRET`, `JWT_REFRESH_SECRET` |
| Platform | `platform_access_token`, `platform_refresh_token` | 2 hours / 7 days | `PLATFORM_JWT_SECRET`, `PLATFORM_JWT_REFRESH_SECRET` |
| Device | `ohmypos_device` (HMAC-signed device id, timing-safe verify) | ~5 years (a terminal's identity, not a session) | `DEVICE_COOKIE_SECRET` |

- All cookies are HttpOnly. Production is cross-origin (Vercel frontend, Render backend), so it uses `sameSite: 'none'` with `secure`.
- **Platform cookies have distinct names, not a distinct path.** A browser sends every cookie whose path prefixes the request, so a shared name would send two values and the server would read whichever came first. Distinct names also let an operator impersonate a tenant in one tab while staying signed in to the console.
- Platform sessions are shorter because one of them can read and suspend every tenant.
- **Separate secrets are what keep the two audiences apart:** a tenant token fails platform signature verification, so the boundary does not rely on a role check someone could forget. Platform tokens are a separate type (`PlatformJwtPayload`) with no roles; a privilege split inside the console would need its own ADR. All secrets are required at boot (`app.module.ts` env schema).
- The impersonation `imp` claim is the one claim that **is** trusted from the token: there is no row to re-read it from, and the signature prevents both adding and removing it.

## Tenant isolation (ADR-025)

| Piece | Role |
|---|---|
| `prisma/tenant-context.ts` | `AsyncLocalStorage` request scope. **Mutable on purpose**: the middleware opens it and the guard fills it in, because re-entering `run()` from the guard would close the scope when the guard returned |
| `prisma/tenant.extension.ts` | Prisma `$allModels` query hook: narrows every `where` and stamps every `data` with `tenantId` |
| `PrismaService` | The extended, tenant-filtered client. Every module injects this |
| `UnscopedPrismaService` | The raw client. Same connection pool |

### The extension rule (`applyTenantScope`)

- **One rule for all models, no per-model branches** (ADR-025 Decision 1). It works because every tenant model, child tables included, has a `tenantId` column, and a special case is exactly where an isolation bug would hide.
- Models **without** `tenant_id` pass through: `Tenant`, `PlatformAdmin`, `ImpersonationSession` (`PLATFORM_MODELS`). Everything else is scoped by default, so a model added later is enforced without anyone remembering it.
- **No tenant in scope → `TenantContextMissingError`**, never an unscoped query. This is a programming error: a request skipped `JwtAuthGuard`, or a script forgot `runWithTenant`.
- `where` is narrowed for reads, updates, deletes, `upsert`, `count`, `aggregate`, `groupBy`. `data` is stamped for `create`, `createMany`, `createManyAndReturn`, and `create` for `upsert`.
- **Nested creates are stamped too** (`create`, `createMany`, `connectOrCreate`, `upsert` inside relation fields). Otherwise children get the schema's `@default("")` and fail on their tenant foreign key at a call site nowhere near the cause. Nested writes are detected structurally (a plain object carrying one of those verbs); no column in this schema is a JSON object, so nothing else can match. `connect`, `set`, `disconnect`, `delete` and `update` address existing rows and are left alone.
- **An explicit `tenantId` on the payload wins.** This is how a new tenant is provisioned.
- `tenantBoundExtension(tenantId)` applies the same rule bound to a fixed id, for e2e fixtures. Jest runs `beforeAll` and each `it` in sibling async contexts, so a scope entered in a hook is invisible in the test body. It deliberately reuses `applyTenantScope`, because a test-only copy would not test what ships.

### Not covered: raw SQL

`$queryRaw` and `$executeRaw` bypass the extension. Raw SQL must filter `tenant_id` explicitly using `requireTenantId()`, which **throws** when no tenant is in scope (DEBT-064). Current users: `reports/report-filters.ts`, the latest-cost write-back in `supplier-purchases`, and the `FOR UPDATE` lock queries.

### Where `UnscopedPrismaService` is allowed

Injecting it is a deliberate, auditable act, legitimate only in:

- `JwtAuthGuard`, `PlatformAuthGuard`, `TenantStatusGuard`, which run before (or outside) a tenant scope;
- `AuthService`, which looks a user up by email before the tenant is known;
- `modules/platform/*`, which is cross-tenant by definition;
- `prisma/seed*.ts`, `scripts/*`, and e2e fixtures spanning tenants.

Anywhere else, it is almost certainly a bug.

### Scope helpers

| Function | Use |
|---|---|
| `currentTenantId()` | Read the scope (null if none) |
| `requireTenantId()` | Raw SQL; throws when no tenant is in scope |
| `adoptTenantScope(id)` | Fill the open scope (`JwtAuthGuard`, and the two `@Public()` auth entry points that identify a user before any guard could) |
| `runWithTenant(id, fn)` | Run `fn` in a tenant scope outside a request (seeds, provisioning) |
| `enterTenantScope(id)` | **Scripts only.** `enterWith` has no natural end, which is fine for a script and wrong for anything concurrent |

### Connection pool

`pg` (used by the Prisma 7 driver adapter) ignores Prisma's `connection_limit` / `pool_timeout` URL parameters, and silently keeps a pool of 10. In the Phase 14 concurrency suite, concurrency above about 10 then surfaced as `ECONNRESET`. `poolConfigFromUrl` parses both parameters and passes them to `pg.Pool` explicitly.

## System references (`system-refs.ts`, ADR-014)

`LedgerEntry.branchId` is NOT NULL, but a central purchase has no branch. Each tenant therefore has one **system branch** (`isSystem: true`, default label `Umum`) for central ledger entries, plus two system categories (`Pembelian Bahan Baku`, `Penjualan`).

- **The system branch is found by `isSystem`, never by name.** At most one exists (partial unique index `branches_single_system`). It used to be looked up by name: a rename broke no foreign key and returned 200, and only the next central purchase failed, with nothing linking cause and effect.
- The label `Umum` is one word on purpose. It describes a scope ("not tied to one store"), not a place; the former `Pusat (Dapur Sentral)` read as a flagship store. A longer label also collided with `Semua Cabang`, the "no branch filter" option in the same report dropdown.
- **The system branch is never accepted from a client.** `branchId: null` is the only way to say "central".
- **Category lookups are keyed by `(tenantId, name)`.** A lookup on the global name would silently attach tenant B's sales to tenant A's category, the most dangerous spot of the multi-tenant conversion.
- `ensureSystemRefs(tx)` is idempotent and used by every provisioning path (`scripts/create-owner.ts`, `prisma/seed.ts`, platform tenant creation). Without it a fresh install fails its first sale and first central purchase with a 503 "Konfigurasi sistem belum lengkap".

## Report periods (`period.ts`, ADR-018)

This is **the** single definition of a calendar range for the repository; inventory delegates to it (ADR-023). Report boundaries and day buckets are in WIB (`Asia/Jakarta`, fixed UTC+7, no DST). Storage is unaffected: timestamps remain UTC instants.

- `resolveReportRange(start, end)` turns two **inclusive** WIB dates into a half-open UTC range `[from, to)`. A sale at 23:59:59.999 on the end day is inside; one at 00:00:00.000 the next day is not. The span is capped at 366 days (`MAX_REPORT_RANGE_DAYS`), because a daily report returns one row per day. Invalid input throws `InvalidReportRangeException` (400).
- `eachWibDay` and `todayWib` are independent of the Node process timezone. Never use `toLocaleDateString`. `todayWib` takes `now` as a parameter so the file stays pure.

## Errors and messages

### `PostgresTriggerExceptionFilter` (global)

| Exception | Response |
|---|---|
| `HttpException` | Passed through |
| body-parser `entity.too.large` | **413**, logged at `warn`. Previously a 500 (ERR-046). Matched by its documented `type`, since body-parser does not export the class. `warn` because body parsing runs before the throttler, so anonymous callers could otherwise flood error logs and the Sentry quota |
| `AllocationExceededError`, or a Postgres `P0001` (`RAISE EXCEPTION` from a domain trigger such as `trg_check_allocation_sum`) | **400** |
| anything else | **500**, logged with the correlation id, method and URL, never the payload (Playbook §9) |

Prisma 7 reports driver errors as `P2039` with the Postgres error nested under `meta.driverAdapterError.cause` (`postgres-error.ts`). Kasync matched Prisma 5's `P2010`/`P2034` shape, which would have let a trigger rejection escape as a 500.

### Idempotency (`idempotency.ts`)

`isIdempotencyReplay(error, indexName)` recognizes a unique violation on an idempotency key. **Call it outside `$transaction`.** A unique violation aborts the Postgres transaction, so a `catch` inside it runs on a dead transaction and every later read fails (TASK-082).

### User-facing messages (`messages.ts`)

Two rules apply here and to every exception message in `modules/`:

1. **Messages are in Indonesian.** The web app shows `body.message` directly on screen, so every thrown message is UI copy.
2. **Messages say what to do next.** "Gagal" alone leaves the reader stuck.

Operator detail (missing env vars, misconfiguration) is **logged, never thrown**; the caller gets `SERVER_MISCONFIGURED`. `TENANT_SUSPENDED` and `PLATFORM_ACCOUNT_DEACTIVATED` are deliberately distinct from `ACCOUNT_DEACTIVATED`, so the reader is pointed to the right person.

## Logging (`app.module.ts`)

pino, with no request or response bodies, because they carry financial data. `authorization` and `cookie` headers are redacted, and so is the `?password=` query parameter of `POST /import/pdf/:accountId`. `redact` only reaches headers, and that PDF unlock password used to be logged in plaintext on every import.

## Testing

| File | Covers |
|---|---|
| `prisma/tenant.extension.spec.ts` | The isolation rule without a database: reads, writes, aggregates, nested writes, explicit tenant, no mutation of args |
| `guards/platform-auth.guard.spec.ts` | Every rejection path of `PlatformAuthGuard`, individually |
| `filters/postgres-trigger-exception.filter.spec.ts` | 413 for oversized bodies (ERR-046) |
| `period.spec.ts` | WIB boundaries, leap years, range caps |
| `test/tenant-isolation.e2e-spec.ts` | End-to-end isolation, including raw SQL reports |
