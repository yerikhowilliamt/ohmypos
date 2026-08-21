-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('BANK', 'CASH', 'EWALLET');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('INFLOW', 'OUTFLOW');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('UNRESOLVED', 'PENDING_REVIEW', 'PARTIALLY_ALLOCATED', 'MATCHED');

-- CreateEnum
CREATE TYPE "AllocationStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "LedgerSourceType" AS ENUM ('MANUAL', 'SALE', 'PURCHASE', 'PAYABLE_SETTLEMENT');

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "opening_balance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "entry_date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "type" "TransactionType" NOT NULL DEFAULT 'OUTFLOW',
    "source_type" "LedgerSourceType" NOT NULL DEFAULT 'MANUAL',
    "source_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_transactions" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "txn_date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "type" "TransactionType" NOT NULL DEFAULT 'OUTFLOW',
    "description" TEXT NOT NULL,
    "external_ref" TEXT,
    "dedup_hash" TEXT,
    "status" "TransactionStatus" NOT NULL DEFAULT 'UNRESOLVED',
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allocations" (
    "id" TEXT NOT NULL,
    "bank_transaction_id" TEXT NOT NULL,
    "ledger_entry_id" TEXT NOT NULL,
    "amount_portion" DECIMAL(18,2) NOT NULL,
    "status" "AllocationStatus" NOT NULL DEFAULT 'ACTIVE',
    "revoked_at" TIMESTAMP(3),
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "branches_name_key" ON "branches"("name");

-- CreateIndex
CREATE INDEX "ledger_entries_entry_date_idx" ON "ledger_entries"("entry_date");

-- CreateIndex
CREATE INDEX "ledger_entries_category_id_idx" ON "ledger_entries"("category_id");

-- CreateIndex
CREATE INDEX "ledger_entries_branch_id_idx" ON "ledger_entries"("branch_id");

-- CreateIndex
CREATE INDEX "ledger_entries_branch_id_entry_date_idx" ON "ledger_entries"("branch_id", "entry_date");

-- CreateIndex
CREATE INDEX "ledger_entries_source_type_source_id_idx" ON "ledger_entries"("source_type", "source_id");

-- CreateIndex
CREATE INDEX "bank_transactions_txn_date_idx" ON "bank_transactions"("txn_date");

-- CreateIndex
CREATE INDEX "bank_transactions_status_idx" ON "bank_transactions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "bank_transactions_account_id_external_ref_key" ON "bank_transactions"("account_id", "external_ref");

-- CreateIndex
CREATE UNIQUE INDEX "bank_transactions_account_id_dedup_hash_key" ON "bank_transactions"("account_id", "dedup_hash");

-- CreateIndex
CREATE INDEX "allocations_bank_transaction_id_idx" ON "allocations"("bank_transaction_id");

-- CreateIndex
CREATE INDEX "allocations_ledger_entry_id_idx" ON "allocations"("ledger_entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "allocations_bank_transaction_id_idempotency_key_key" ON "allocations"("bank_transaction_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_bank_transaction_id_fkey" FOREIGN KEY ("bank_transaction_id") REFERENCES "bank_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_ledger_entry_id_fkey" FOREIGN KEY ("ledger_entry_id") REFERENCES "ledger_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Triggers ported verbatim from Kasync's
-- prisma/migrations/20260809180000_multi_tenancy_and_triggers/migration.sql
-- (the later definition, which carries the ::text cast fix).
--
-- trg_check_allocation_sum enforces the invariant
--   sum(Allocation.amountPortion) <= BankTransaction.amount
-- taking a FOR UPDATE row lock first, which is what closes the check-then-act
-- race under concurrent allocation (ERD §2, Playbook §7).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION check_allocation_sum()
RETURNS TRIGGER AS $$
DECLARE
  total_allocated DECIMAL(18,2);
  txn_amount DECIMAL(18,2);
BEGIN
  SELECT amount INTO txn_amount
  FROM bank_transactions
  WHERE id = NEW.bank_transaction_id
  FOR UPDATE;

  SELECT COALESCE(SUM(amount_portion), 0) INTO total_allocated
  FROM allocations
  WHERE bank_transaction_id = NEW.bank_transaction_id
    AND status = 'ACTIVE'
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000');

  IF (total_allocated + NEW.amount_portion) > txn_amount THEN
    RAISE EXCEPTION
      'Allocation total (%) would exceed bank transaction amount (%) for transaction %',
      (total_allocated + NEW.amount_portion), txn_amount, NEW.bank_transaction_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_allocation_sum ON allocations;

CREATE TRIGGER trg_check_allocation_sum
BEFORE INSERT OR UPDATE ON allocations
FOR EACH ROW
EXECUTE FUNCTION check_allocation_sum();

CREATE OR REPLACE FUNCTION sync_transaction_status()
RETURNS TRIGGER AS $$
DECLARE
  target_txn_id TEXT;
  total_allocated DECIMAL(18,2);
  txn_amount DECIMAL(18,2);
BEGIN
  target_txn_id := COALESCE(NEW.bank_transaction_id, OLD.bank_transaction_id);

  SELECT amount INTO txn_amount
  FROM bank_transactions WHERE id = target_txn_id;

  SELECT COALESCE(SUM(amount_portion), 0) INTO total_allocated
  FROM allocations WHERE bank_transaction_id = target_txn_id AND status = 'ACTIVE';

  UPDATE bank_transactions
  SET status = CASE
    WHEN total_allocated = 0 THEN 'UNRESOLVED'
    WHEN total_allocated < txn_amount THEN 'PARTIALLY_ALLOCATED'
    ELSE 'MATCHED'
  END::text::"TransactionStatus"
  WHERE id = target_txn_id;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_transaction_status ON allocations;

CREATE TRIGGER trg_sync_transaction_status
AFTER INSERT OR UPDATE OR DELETE ON allocations
FOR EACH ROW
EXECUTE FUNCTION sync_transaction_status();
