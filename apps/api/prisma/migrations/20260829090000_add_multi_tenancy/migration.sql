-- v2 multi-tenancy (ADR-025, plan Fase 1 / TASK-123).
--
-- Hand-edited on top of `prisma migrate diff` output. Prisma cannot model one
-- `tenant_id` column participating in many relations at once, so the composite
-- (id, tenant_id) foreign keys at the bottom are raw SQL; Prisma tolerates DB
-- constraints it does not know about.
--
-- Order matters and is fixed by the plan: platform tables -> default tenant ->
-- nullable column -> backfill -> NOT NULL -> single-column FK -> composite
-- unique/FK -> indexes.

-- ===========================================================================
-- STEP 1 — platform tables
-- ===========================================================================

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_admins" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "refresh_token_hash" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "token_valid_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "impersonation_sessions" (
    "id" TEXT NOT NULL,
    "platform_admin_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "acting_as_user_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "impersonation_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "platform_admins_email_key" ON "platform_admins"("email");

-- CreateIndex
CREATE INDEX "impersonation_sessions_platform_admin_id_idx" ON "impersonation_sessions"("platform_admin_id");

-- CreateIndex
CREATE INDEX "impersonation_sessions_tenant_id_started_at_idx" ON "impersonation_sessions"("tenant_id", "started_at");

-- AddForeignKey
ALTER TABLE "impersonation_sessions" ADD CONSTRAINT "impersonation_sessions_platform_admin_id_fkey" FOREIGN KEY ("platform_admin_id") REFERENCES "platform_admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impersonation_sessions" ADD CONSTRAINT "impersonation_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ===========================================================================
-- STEP 2 — the default tenant, adopted from whatever data already exists
-- ===========================================================================

INSERT INTO "tenants" ("id", "name", "slug", "status", "created_at", "updated_at")
SELECT gen_random_uuid()::text,
       COALESCE(NULLIF(bp."name", ''), 'OhMyPos'),
       'default',
       'ACTIVE',
       now(), now()
FROM "business_profiles" bp
LIMIT 1;

-- A fresh install has no business_profiles row; there must still be one tenant.
INSERT INTO "tenants" ("id", "name", "slug", "status", "created_at", "updated_at")
SELECT gen_random_uuid()::text, 'OhMyPos', 'default', 'ACTIVE', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "tenants");

-- ===========================================================================
-- STEP 3 — tenant_id, nullable for now, on all 23 tenant-scoped tables
-- ===========================================================================

ALTER TABLE "accounts" ADD COLUMN "tenant_id" TEXT;
ALTER TABLE "categories" ADD COLUMN "tenant_id" TEXT;
ALTER TABLE "branches" ADD COLUMN "tenant_id" TEXT;
ALTER TABLE "ledger_entries" ADD COLUMN "tenant_id" TEXT;
ALTER TABLE "bank_transactions" ADD COLUMN "tenant_id" TEXT;
ALTER TABLE "allocations" ADD COLUMN "tenant_id" TEXT;
ALTER TABLE "users" ADD COLUMN "tenant_id" TEXT;
ALTER TABLE "raw_materials" ADD COLUMN "tenant_id" TEXT;
ALTER TABLE "products" ADD COLUMN "tenant_id" TEXT;
ALTER TABLE "recipe_items" ADD COLUMN "tenant_id" TEXT;
ALTER TABLE "sales" ADD COLUMN "tenant_id" TEXT;
ALTER TABLE "sale_items" ADD COLUMN "tenant_id" TEXT;
ALTER TABLE "suppliers" ADD COLUMN "tenant_id" TEXT;
ALTER TABLE "supplier_purchases" ADD COLUMN "tenant_id" TEXT;
ALTER TABLE "supplier_purchase_items" ADD COLUMN "tenant_id" TEXT;
ALTER TABLE "payables" ADD COLUMN "tenant_id" TEXT;
ALTER TABLE "payable_settlements" ADD COLUMN "tenant_id" TEXT;
ALTER TABLE "stock_movements" ADD COLUMN "tenant_id" TEXT;
ALTER TABLE "opening_stocks" ADD COLUMN "tenant_id" TEXT;
ALTER TABLE "devices" ADD COLUMN "tenant_id" TEXT;
ALTER TABLE "attendance_records" ADD COLUMN "tenant_id" TEXT;
ALTER TABLE "leave_requests" ADD COLUMN "tenant_id" TEXT;
ALTER TABLE "business_profiles" ADD COLUMN "tenant_id" TEXT;

-- ===========================================================================
-- STEP 4 — backfill every existing row onto the default tenant
-- ===========================================================================

UPDATE "accounts" SET "tenant_id" = (SELECT "id" FROM "tenants" ORDER BY "created_at" LIMIT 1);
UPDATE "categories" SET "tenant_id" = (SELECT "id" FROM "tenants" ORDER BY "created_at" LIMIT 1);
UPDATE "branches" SET "tenant_id" = (SELECT "id" FROM "tenants" ORDER BY "created_at" LIMIT 1);
UPDATE "ledger_entries" SET "tenant_id" = (SELECT "id" FROM "tenants" ORDER BY "created_at" LIMIT 1);
UPDATE "bank_transactions" SET "tenant_id" = (SELECT "id" FROM "tenants" ORDER BY "created_at" LIMIT 1);
UPDATE "allocations" SET "tenant_id" = (SELECT "id" FROM "tenants" ORDER BY "created_at" LIMIT 1);
UPDATE "users" SET "tenant_id" = (SELECT "id" FROM "tenants" ORDER BY "created_at" LIMIT 1);
UPDATE "raw_materials" SET "tenant_id" = (SELECT "id" FROM "tenants" ORDER BY "created_at" LIMIT 1);
UPDATE "products" SET "tenant_id" = (SELECT "id" FROM "tenants" ORDER BY "created_at" LIMIT 1);
UPDATE "recipe_items" SET "tenant_id" = (SELECT "id" FROM "tenants" ORDER BY "created_at" LIMIT 1);
UPDATE "sales" SET "tenant_id" = (SELECT "id" FROM "tenants" ORDER BY "created_at" LIMIT 1);
UPDATE "sale_items" SET "tenant_id" = (SELECT "id" FROM "tenants" ORDER BY "created_at" LIMIT 1);
UPDATE "suppliers" SET "tenant_id" = (SELECT "id" FROM "tenants" ORDER BY "created_at" LIMIT 1);
UPDATE "supplier_purchases" SET "tenant_id" = (SELECT "id" FROM "tenants" ORDER BY "created_at" LIMIT 1);
UPDATE "supplier_purchase_items" SET "tenant_id" = (SELECT "id" FROM "tenants" ORDER BY "created_at" LIMIT 1);
UPDATE "payables" SET "tenant_id" = (SELECT "id" FROM "tenants" ORDER BY "created_at" LIMIT 1);
UPDATE "payable_settlements" SET "tenant_id" = (SELECT "id" FROM "tenants" ORDER BY "created_at" LIMIT 1);
UPDATE "stock_movements" SET "tenant_id" = (SELECT "id" FROM "tenants" ORDER BY "created_at" LIMIT 1);
UPDATE "opening_stocks" SET "tenant_id" = (SELECT "id" FROM "tenants" ORDER BY "created_at" LIMIT 1);
UPDATE "devices" SET "tenant_id" = (SELECT "id" FROM "tenants" ORDER BY "created_at" LIMIT 1);
UPDATE "attendance_records" SET "tenant_id" = (SELECT "id" FROM "tenants" ORDER BY "created_at" LIMIT 1);
UPDATE "leave_requests" SET "tenant_id" = (SELECT "id" FROM "tenants" ORDER BY "created_at" LIMIT 1);
UPDATE "business_profiles" SET "tenant_id" = (SELECT "id" FROM "tenants" ORDER BY "created_at" LIMIT 1);

-- ===========================================================================
-- STEP 5 — only now can the column be NOT NULL
-- ===========================================================================

ALTER TABLE "accounts" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "categories" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "branches" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "ledger_entries" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "bank_transactions" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "allocations" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "raw_materials" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "products" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "recipe_items" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "sales" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "sale_items" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "suppliers" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "supplier_purchases" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "supplier_purchase_items" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "payables" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "payable_settlements" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "stock_movements" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "opening_stocks" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "devices" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "attendance_records" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "leave_requests" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "business_profiles" ALTER COLUMN "tenant_id" SET NOT NULL;

-- The `@default('')` on Prisma's side is a TYPING device (see schema.prisma):
-- it makes tenantId optional in the generated create inputs so the 25 existing
-- modules did not have to thread a tenant argument through every write. The
-- empty string is not a valid tenant id, so a write that somehow escaped the
-- Prisma extension fails on <table>_tenant_id_fkey rather than landing in a
-- random tenant.

ALTER TABLE "accounts" ALTER COLUMN "tenant_id" SET DEFAULT '';
ALTER TABLE "categories" ALTER COLUMN "tenant_id" SET DEFAULT '';
ALTER TABLE "branches" ALTER COLUMN "tenant_id" SET DEFAULT '';
ALTER TABLE "ledger_entries" ALTER COLUMN "tenant_id" SET DEFAULT '';
ALTER TABLE "bank_transactions" ALTER COLUMN "tenant_id" SET DEFAULT '';
ALTER TABLE "allocations" ALTER COLUMN "tenant_id" SET DEFAULT '';
ALTER TABLE "users" ALTER COLUMN "tenant_id" SET DEFAULT '';
ALTER TABLE "raw_materials" ALTER COLUMN "tenant_id" SET DEFAULT '';
ALTER TABLE "products" ALTER COLUMN "tenant_id" SET DEFAULT '';
ALTER TABLE "recipe_items" ALTER COLUMN "tenant_id" SET DEFAULT '';
ALTER TABLE "sales" ALTER COLUMN "tenant_id" SET DEFAULT '';
ALTER TABLE "sale_items" ALTER COLUMN "tenant_id" SET DEFAULT '';
ALTER TABLE "suppliers" ALTER COLUMN "tenant_id" SET DEFAULT '';
ALTER TABLE "supplier_purchases" ALTER COLUMN "tenant_id" SET DEFAULT '';
ALTER TABLE "supplier_purchase_items" ALTER COLUMN "tenant_id" SET DEFAULT '';
ALTER TABLE "payables" ALTER COLUMN "tenant_id" SET DEFAULT '';
ALTER TABLE "payable_settlements" ALTER COLUMN "tenant_id" SET DEFAULT '';
ALTER TABLE "stock_movements" ALTER COLUMN "tenant_id" SET DEFAULT '';
ALTER TABLE "opening_stocks" ALTER COLUMN "tenant_id" SET DEFAULT '';
ALTER TABLE "devices" ALTER COLUMN "tenant_id" SET DEFAULT '';
ALTER TABLE "attendance_records" ALTER COLUMN "tenant_id" SET DEFAULT '';
ALTER TABLE "leave_requests" ALTER COLUMN "tenant_id" SET DEFAULT '';
ALTER TABLE "business_profiles" ALTER COLUMN "tenant_id" SET DEFAULT '';
-- ===========================================================================
-- STEP 6 — single-column tenant foreign keys
-- ===========================================================================

ALTER TABLE "accounts" ADD CONSTRAINT "accounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "categories" ADD CONSTRAINT "categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "branches" ADD CONSTRAINT "branches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "raw_materials" ADD CONSTRAINT "raw_materials_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales" ADD CONSTRAINT "sales_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_purchases" ADD CONSTRAINT "supplier_purchases_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_purchase_items" ADD CONSTRAINT "supplier_purchase_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payables" ADD CONSTRAINT "payables_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payable_settlements" ADD CONSTRAINT "payable_settlements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "opening_stocks" ADD CONSTRAINT "opening_stocks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "devices" ADD CONSTRAINT "devices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "business_profiles" ADD CONSTRAINT "business_profiles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ===========================================================================
-- STEP 7 — global uniques become per-tenant uniques.
-- users_email_key and devices_activation_code_key stay GLOBAL on purpose
-- (ADR-025 Decision 6): one email is one account is one tenant, and device
-- activation happens before any tenant context exists.
-- ===========================================================================

DROP INDEX "categories_name_key";
CREATE UNIQUE INDEX "categories_tenant_id_name_key" ON "categories"("tenant_id", "name");

DROP INDEX "branches_name_key";
CREATE UNIQUE INDEX "branches_tenant_id_name_key" ON "branches"("tenant_id", "name");

DROP INDEX "raw_materials_name_key";
CREATE UNIQUE INDEX "raw_materials_tenant_id_name_key" ON "raw_materials"("tenant_id", "name");

DROP INDEX "products_name_key";
CREATE UNIQUE INDEX "products_tenant_id_name_key" ON "products"("tenant_id", "name");

DROP INDEX "suppliers_name_key";
CREATE UNIQUE INDEX "suppliers_tenant_id_name_key" ON "suppliers"("tenant_id", "name");

DROP INDEX "sales_idempotency_key_key";
CREATE UNIQUE INDEX "sales_tenant_id_idempotency_key_key" ON "sales"("tenant_id", "idempotency_key");

DROP INDEX "supplier_purchases_idempotency_key_key";
CREATE UNIQUE INDEX "supplier_purchases_tenant_id_idempotency_key_key" ON "supplier_purchases"("tenant_id", "idempotency_key");

DROP INDEX "payable_settlements_idempotency_key_key";
CREATE UNIQUE INDEX "payable_settlements_tenant_id_idempotency_key_key" ON "payable_settlements"("tenant_id", "idempotency_key");

-- One business profile per tenant.
CREATE UNIQUE INDEX "business_profiles_tenant_id_key" ON "business_profiles"("tenant_id");

-- ===========================================================================
-- STEP 8 — composite (id, tenant_id) uniques on the 13 referenced parents,
-- then 35 composite foreign keys that make a cross-tenant reference
-- physically impossible rather than merely discouraged.
--
-- All DEFERRABLE INITIALLY DEFERRED, checked at COMMIT. The existing
-- single-column FKs carry ON DELETE CASCADE / SET NULL; an immediate check
-- would fire mid-cascade, and mirroring SET NULL onto a composite that
-- includes the NOT NULL tenant_id could not work at all.
--
-- MATCH SIMPLE (the Postgres default) skips the check when any column is
-- NULL, which is exactly what central purchases (branch_id IS NULL, ADR-004)
-- and the other nullable references need.
-- ===========================================================================

ALTER TABLE "accounts" ADD CONSTRAINT "accounts_id_tenant_id_key" UNIQUE ("id", "tenant_id");
ALTER TABLE "categories" ADD CONSTRAINT "categories_id_tenant_id_key" UNIQUE ("id", "tenant_id");
ALTER TABLE "branches" ADD CONSTRAINT "branches_id_tenant_id_key" UNIQUE ("id", "tenant_id");
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_id_tenant_id_key" UNIQUE ("id", "tenant_id");
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_id_tenant_id_key" UNIQUE ("id", "tenant_id");
ALTER TABLE "users" ADD CONSTRAINT "users_id_tenant_id_key" UNIQUE ("id", "tenant_id");
ALTER TABLE "products" ADD CONSTRAINT "products_id_tenant_id_key" UNIQUE ("id", "tenant_id");
ALTER TABLE "raw_materials" ADD CONSTRAINT "raw_materials_id_tenant_id_key" UNIQUE ("id", "tenant_id");
ALTER TABLE "sales" ADD CONSTRAINT "sales_id_tenant_id_key" UNIQUE ("id", "tenant_id");
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_id_tenant_id_key" UNIQUE ("id", "tenant_id");
ALTER TABLE "supplier_purchases" ADD CONSTRAINT "supplier_purchases_id_tenant_id_key" UNIQUE ("id", "tenant_id");
ALTER TABLE "payables" ADD CONSTRAINT "payables_id_tenant_id_key" UNIQUE ("id", "tenant_id");
ALTER TABLE "devices" ADD CONSTRAINT "devices_id_tenant_id_key" UNIQUE ("id", "tenant_id");

ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_tenant_id_fkey"
  FOREIGN KEY ("account_id", "tenant_id") REFERENCES "accounts"("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_category_id_tenant_id_fkey"
  FOREIGN KEY ("category_id", "tenant_id") REFERENCES "categories"("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_branch_id_tenant_id_fkey"
  FOREIGN KEY ("branch_id", "tenant_id") REFERENCES "branches"("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_account_id_tenant_id_fkey"
  FOREIGN KEY ("account_id", "tenant_id") REFERENCES "accounts"("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_bank_transaction_id_tenant_id_fkey"
  FOREIGN KEY ("bank_transaction_id", "tenant_id") REFERENCES "bank_transactions"("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_ledger_entry_id_tenant_id_fkey"
  FOREIGN KEY ("ledger_entry_id", "tenant_id") REFERENCES "ledger_entries"("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "users" ADD CONSTRAINT "users_branch_id_tenant_id_fkey"
  FOREIGN KEY ("branch_id", "tenant_id") REFERENCES "branches"("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_product_id_tenant_id_fkey"
  FOREIGN KEY ("product_id", "tenant_id") REFERENCES "products"("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_raw_material_id_tenant_id_fkey"
  FOREIGN KEY ("raw_material_id", "tenant_id") REFERENCES "raw_materials"("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "sales" ADD CONSTRAINT "sales_branch_id_tenant_id_fkey"
  FOREIGN KEY ("branch_id", "tenant_id") REFERENCES "branches"("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "sales" ADD CONSTRAINT "sales_account_id_tenant_id_fkey"
  FOREIGN KEY ("account_id", "tenant_id") REFERENCES "accounts"("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "sales" ADD CONSTRAINT "sales_ledger_entry_id_tenant_id_fkey"
  FOREIGN KEY ("ledger_entry_id", "tenant_id") REFERENCES "ledger_entries"("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "sales" ADD CONSTRAINT "sales_user_id_tenant_id_fkey"
  FOREIGN KEY ("user_id", "tenant_id") REFERENCES "users"("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "sales" ADD CONSTRAINT "sales_voided_by_user_id_tenant_id_fkey"
  FOREIGN KEY ("voided_by_user_id", "tenant_id") REFERENCES "users"("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_tenant_id_fkey"
  FOREIGN KEY ("sale_id", "tenant_id") REFERENCES "sales"("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_product_id_tenant_id_fkey"
  FOREIGN KEY ("product_id", "tenant_id") REFERENCES "products"("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "supplier_purchases" ADD CONSTRAINT "supplier_purchases_supplier_id_tenant_id_fkey"
  FOREIGN KEY ("supplier_id", "tenant_id") REFERENCES "suppliers"("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "supplier_purchases" ADD CONSTRAINT "supplier_purchases_branch_id_tenant_id_fkey"
  FOREIGN KEY ("branch_id", "tenant_id") REFERENCES "branches"("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "supplier_purchases" ADD CONSTRAINT "supplier_purchases_ledger_entry_id_tenant_id_fkey"
  FOREIGN KEY ("ledger_entry_id", "tenant_id") REFERENCES "ledger_entries"("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "supplier_purchase_items" ADD CONSTRAINT "supplier_purchase_items_supplier_purchase_id_tenant_id_fkey"
  FOREIGN KEY ("supplier_purchase_id", "tenant_id") REFERENCES "supplier_purchases"("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "supplier_purchase_items" ADD CONSTRAINT "supplier_purchase_items_raw_material_id_tenant_id_fkey"
  FOREIGN KEY ("raw_material_id", "tenant_id") REFERENCES "raw_materials"("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "payables" ADD CONSTRAINT "payables_supplier_purchase_id_tenant_id_fkey"
  FOREIGN KEY ("supplier_purchase_id", "tenant_id") REFERENCES "supplier_purchases"("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "payables" ADD CONSTRAINT "payables_supplier_id_tenant_id_fkey"
  FOREIGN KEY ("supplier_id", "tenant_id") REFERENCES "suppliers"("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "payable_settlements" ADD CONSTRAINT "payable_settlements_payable_id_tenant_id_fkey"
  FOREIGN KEY ("payable_id", "tenant_id") REFERENCES "payables"("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "payable_settlements" ADD CONSTRAINT "payable_settlements_account_id_tenant_id_fkey"
  FOREIGN KEY ("account_id", "tenant_id") REFERENCES "accounts"("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "payable_settlements" ADD CONSTRAINT "payable_settlements_ledger_entry_id_tenant_id_fkey"
  FOREIGN KEY ("ledger_entry_id", "tenant_id") REFERENCES "ledger_entries"("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_raw_material_id_tenant_id_fkey"
  FOREIGN KEY ("raw_material_id", "tenant_id") REFERENCES "raw_materials"("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_branch_id_tenant_id_fkey"
  FOREIGN KEY ("branch_id", "tenant_id") REFERENCES "branches"("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "opening_stocks" ADD CONSTRAINT "opening_stocks_raw_material_id_tenant_id_fkey"
  FOREIGN KEY ("raw_material_id", "tenant_id") REFERENCES "raw_materials"("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "devices" ADD CONSTRAINT "devices_branch_id_tenant_id_fkey"
  FOREIGN KEY ("branch_id", "tenant_id") REFERENCES "branches"("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "devices" ADD CONSTRAINT "devices_activated_by_user_id_tenant_id_fkey"
  FOREIGN KEY ("activated_by_user_id", "tenant_id") REFERENCES "users"("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_user_id_tenant_id_fkey"
  FOREIGN KEY ("user_id", "tenant_id") REFERENCES "users"("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_device_id_tenant_id_fkey"
  FOREIGN KEY ("device_id", "tenant_id") REFERENCES "devices"("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_user_id_tenant_id_fkey"
  FOREIGN KEY ("user_id", "tenant_id") REFERENCES "users"("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_reviewed_by_user_id_tenant_id_fkey"
  FOREIGN KEY ("reviewed_by_user_id", "tenant_id") REFERENCES "users"("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- ===========================================================================
-- STEP 9 — indexes. Hot-path indexes gain a tenant_id prefix; the old ones
-- are kept until there is real data to measure against.
-- ===========================================================================

CREATE INDEX "accounts_tenant_id_idx" ON "accounts"("tenant_id");
CREATE INDEX "bank_transactions_tenant_id_idx" ON "bank_transactions"("tenant_id");
CREATE INDEX "allocations_tenant_id_idx" ON "allocations"("tenant_id");
CREATE INDEX "users_tenant_id_idx" ON "users"("tenant_id");
CREATE INDEX "recipe_items_tenant_id_idx" ON "recipe_items"("tenant_id");
CREATE INDEX "sale_items_tenant_id_idx" ON "sale_items"("tenant_id");
CREATE INDEX "supplier_purchase_items_tenant_id_idx" ON "supplier_purchase_items"("tenant_id");
CREATE INDEX "payables_tenant_id_idx" ON "payables"("tenant_id");
CREATE INDEX "opening_stocks_tenant_id_idx" ON "opening_stocks"("tenant_id");
CREATE INDEX "devices_tenant_id_idx" ON "devices"("tenant_id");
CREATE INDEX "attendance_records_tenant_id_idx" ON "attendance_records"("tenant_id");
CREATE INDEX "leave_requests_tenant_id_idx" ON "leave_requests"("tenant_id");

CREATE INDEX "ledger_entries_tenant_id_branch_id_entry_date_idx" ON "ledger_entries"("tenant_id", "branch_id", "entry_date");
CREATE INDEX "sales_tenant_id_branch_id_sold_at_idx" ON "sales"("tenant_id", "branch_id", "sold_at");
CREATE INDEX "supplier_purchases_tenant_id_branch_id_purchase_date_idx" ON "supplier_purchases"("tenant_id", "branch_id", "purchase_date");
CREATE INDEX "stock_movements_tenant_id_raw_material_id_movement_date_dir_idx" ON "stock_movements"("tenant_id", "raw_material_id", "movement_date", "direction");
