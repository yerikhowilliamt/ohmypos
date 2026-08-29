-- Two identity flags on `branches`.
--
-- `is_system` marks the ADR-014 ledger-attribution row: a SCOPE ("not tied to
-- any one store"), not a place. It replaces the row's NAME as the lookup key
-- used by `resolveLedgerBranchId`, which is what made renaming that row a silent
-- 503 generator — the rename broke no FK, so it returned 200 and only the next
-- central purchase failed.
--
-- `is_main_store` marks the Owner's first store. Both are enforced by partial
-- unique indexes below rather than by application logic.

-- AlterTable
ALTER TABLE "branches" ADD COLUMN     "is_main_store" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_system" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
-- Pre-existing drift, not part of this change: the ADR-024 migration added this
-- column WITH a default so it could backfill existing rows, and never dropped
-- it. `schema.prisma:658` has no @default, so Prisma emits this on the next
-- migration regardless of what that migration is about. Keeping it: this column
-- is a per-line snapshot, and a silent default of 1 would mask a write path that
-- forgot to record the real conversion factor.
ALTER TABLE "supplier_purchase_items" ALTER COLUMN "conversion_factor" DROP DEFAULT;

-- Flag the existing ledger-attribution row and give it a name that reads as a
-- scope rather than a place. Matched on the OLD name because that is still the
-- only thing identifying it at this point in the migration. On a database
-- provisioned by `create-owner.ts` this matches zero rows, which is correct —
-- `ensureSystemRefs` creates the row with the flag already set.
UPDATE "branches"
SET "is_system" = true, "name" = 'Umum (Semua Cabang)'
WHERE "name" = 'Pusat (Dapur Sentral)';

-- Backfill: the oldest non-system branch becomes the main store.
-- NOT EXISTS makes a re-run a no-op instead of a constraint violation.
UPDATE "branches" SET "is_main_store" = true
WHERE "id" = (
  SELECT "id" FROM "branches"
  WHERE "is_system" = false
  ORDER BY "created_at" ASC
  LIMIT 1
)
AND NOT EXISTS (SELECT 1 FROM "branches" WHERE "is_main_store" = true);

-- At most one system row, enforced by the database. `resolveLedgerBranchId`
-- uses findFirst on this flag and relies on this index for uniqueness.
CREATE UNIQUE INDEX "branches_single_system"
  ON "branches" (("is_system")) WHERE "is_system";

-- At most one main store, enforced by the database rather than by a disabled
-- switch in the UI — two browser tabs cannot race past this.
CREATE UNIQUE INDEX "branches_single_main_store"
  ON "branches" (("is_main_store")) WHERE "is_main_store";
