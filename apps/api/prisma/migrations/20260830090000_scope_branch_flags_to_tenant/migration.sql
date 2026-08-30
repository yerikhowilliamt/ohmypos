-- ADR-025 — scope the two Branch identity flags to the tenant.
--
-- `20260828201617_add_branch_system_and_main_store` (TASK-120) created these as
-- GLOBAL partial unique indexes, which was correct while OhMyPos was a single
-- business. Multi-tenancy made them a hard blocker and nothing caught it:
-- neither index appears in `schema.prisma` — Prisma cannot express a partial
-- index — so the Phase 1 audit of unique constraints (plan §1.3), which worked
-- from the schema, never saw them.
--
-- The effect was that only ONE tenant on the entire platform could own a system
-- branch, and only one a main store. `POST /platform/tenants` therefore failed
-- for the second tenant ever created, at `ensureSystemRefs`, with
-- `branches_single_system` — and the whole provisioning transaction rolled
-- back. Found by `tenant-isolation.e2e-spec.ts` (ERR-044).
--
-- Indexed on `tenant_id` alone rather than `(tenant_id, is_system)`: the
-- `WHERE` clause already restricts the index to rows where the flag is true, so
-- the flag column carries no information inside it. One row per tenant is
-- exactly the guarantee both indexes are meant to make.
--
-- No backfill: the predicate can only be violated by two rows sharing a tenant,
-- and the pre-multi-tenancy database had at most one of each in total.

DROP INDEX "branches_single_system";
DROP INDEX "branches_single_main_store";

-- At most one system row PER TENANT. `resolveLedgerBranchId` uses findFirst on
-- this flag through the tenant-filtered client and relies on this uniqueness.
CREATE UNIQUE INDEX "branches_single_system"
  ON "branches" ("tenant_id") WHERE "is_system";

-- At most one main store per tenant, enforced by the database rather than by a
-- disabled switch in the UI — two browser tabs cannot race past this.
CREATE UNIQUE INDEX "branches_single_main_store"
  ON "branches" ("tenant_id") WHERE "is_main_store";
