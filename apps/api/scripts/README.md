# apps/api/scripts

Operational CLIs. **Shell or database access is the authentication**, and there is deliberately no HTTP equivalent for any of them. None of them ships in the production image: the runtime stage of `Dockerfile` copies `dist`, `prisma`, `src/generated`, `package.json` and `node_modules`, not `scripts/`. Run them locally with `DATABASE_URL` pointed at the target database.

| Command | Script | Purpose |
|---|---|---|
| `pnpm --filter api create:owner` | `create-owner.ts` | v1 bootstrap: creates the first `OWNER` in the default tenant (adopting or creating it) and runs `ensureSystemRefs`. Without system refs, the first sale and first central purchase fail with a 503. Idempotent, so it is safe to re-run on a live database. The email uniqueness check is unscoped, because `User.email` is globally unique (ADR-025 Decision 6). Additional tenants are created through `POST /platform/tenants` |
| `pnpm --filter api create:platform-admin` | `create-platform-admin.ts` | The **only** way a platform admin comes into existence (ADR-025). The first one cannot be created through an authenticated API, and an unauthenticated endpoint would be the worst one in the system. It uses `UnscopedPrismaService` only and never opens a tenant scope, since a platform admin belongs to no tenant. Password minimum 12 characters, bcrypt cost 10 |
| `pnpm --filter api reset:platform-admin-password` | `reset-platform-admin-password.ts` | The last recovery path for the platform console (TASK-130). `PATCH /platform/auth/password` needs the current password, and nobody sits above a platform admin (staff are reset by their `OWNER`, an `OWNER` by a platform admin, a platform admin by this script). See `docs/runbooks/platform-admin-recovery.md` |

All three prompt interactively (with hidden password input) and hash with bcrypt cost 10.
