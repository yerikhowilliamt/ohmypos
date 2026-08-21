-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PAID', 'UNPAID', 'PARTIALLY_PAID');

-- CreateEnum
CREATE TYPE "PayableStatus" AS ENUM ('OPEN', 'PARTIALLY_SETTLED', 'SETTLED');

-- CreateEnum
CREATE TYPE "StockDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "StockReferenceType" AS ENUM ('SALE', 'PURCHASE', 'OPENING', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_purchases" (
    "id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "total_amount" DECIMAL(18,2) NOT NULL,
    "purchase_date" TIMESTAMP(3) NOT NULL,
    "payment_status" "PaymentStatus" NOT NULL,
    "ledger_entry_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_purchase_items" (
    "id" TEXT NOT NULL,
    "supplier_purchase_id" TEXT NOT NULL,
    "raw_material_id" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit_cost" DECIMAL(18,2) NOT NULL,
    "line_total" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_purchase_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payables" (
    "id" TEXT NOT NULL,
    "supplier_purchase_id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "original_amount" DECIMAL(18,2) NOT NULL,
    "remaining_balance" DECIMAL(18,2) NOT NULL,
    "status" "PayableStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payable_settlements" (
    "id" TEXT NOT NULL,
    "payable_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "ledger_entry_id" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "settled_at" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payable_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "raw_material_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "direction" "StockDirection" NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "reference_type" "StockReferenceType" NOT NULL,
    "reference_id" TEXT,
    "unit_cost_at_movement" DECIMAL(18,2) NOT NULL,
    "movement_date" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_name_key" ON "suppliers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_purchases_ledger_entry_id_key" ON "supplier_purchases"("ledger_entry_id");

-- CreateIndex
CREATE INDEX "supplier_purchases_supplier_id_idx" ON "supplier_purchases"("supplier_id");

-- CreateIndex
CREATE INDEX "supplier_purchases_branch_id_idx" ON "supplier_purchases"("branch_id");

-- CreateIndex
CREATE INDEX "supplier_purchases_purchase_date_idx" ON "supplier_purchases"("purchase_date");

-- CreateIndex
CREATE INDEX "supplier_purchases_branch_id_purchase_date_idx" ON "supplier_purchases"("branch_id", "purchase_date");

-- CreateIndex
CREATE INDEX "supplier_purchase_items_supplier_purchase_id_idx" ON "supplier_purchase_items"("supplier_purchase_id");

-- CreateIndex
CREATE INDEX "supplier_purchase_items_raw_material_id_idx" ON "supplier_purchase_items"("raw_material_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_purchase_items_supplier_purchase_id_raw_material_i_key" ON "supplier_purchase_items"("supplier_purchase_id", "raw_material_id");

-- CreateIndex
CREATE UNIQUE INDEX "payables_supplier_purchase_id_key" ON "payables"("supplier_purchase_id");

-- CreateIndex
CREATE INDEX "payables_supplier_id_idx" ON "payables"("supplier_id");

-- CreateIndex
CREATE INDEX "payables_status_idx" ON "payables"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payable_settlements_ledger_entry_id_key" ON "payable_settlements"("ledger_entry_id");

-- CreateIndex
CREATE INDEX "payable_settlements_payable_id_idx" ON "payable_settlements"("payable_id");

-- CreateIndex
CREATE INDEX "payable_settlements_settled_at_idx" ON "payable_settlements"("settled_at");

-- CreateIndex
CREATE INDEX "stock_movements_raw_material_id_movement_date_idx" ON "stock_movements"("raw_material_id", "movement_date");

-- CreateIndex
CREATE INDEX "stock_movements_reference_type_reference_id_idx" ON "stock_movements"("reference_type", "reference_id");

-- CreateIndex
CREATE INDEX "stock_movements_branch_id_idx" ON "stock_movements"("branch_id");

-- AddForeignKey
ALTER TABLE "supplier_purchases" ADD CONSTRAINT "supplier_purchases_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_purchases" ADD CONSTRAINT "supplier_purchases_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_purchases" ADD CONSTRAINT "supplier_purchases_ledger_entry_id_fkey" FOREIGN KEY ("ledger_entry_id") REFERENCES "ledger_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_purchase_items" ADD CONSTRAINT "supplier_purchase_items_supplier_purchase_id_fkey" FOREIGN KEY ("supplier_purchase_id") REFERENCES "supplier_purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_purchase_items" ADD CONSTRAINT "supplier_purchase_items_raw_material_id_fkey" FOREIGN KEY ("raw_material_id") REFERENCES "raw_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payables" ADD CONSTRAINT "payables_supplier_purchase_id_fkey" FOREIGN KEY ("supplier_purchase_id") REFERENCES "supplier_purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payables" ADD CONSTRAINT "payables_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payable_settlements" ADD CONSTRAINT "payable_settlements_payable_id_fkey" FOREIGN KEY ("payable_id") REFERENCES "payables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payable_settlements" ADD CONSTRAINT "payable_settlements_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payable_settlements" ADD CONSTRAINT "payable_settlements_ledger_entry_id_fkey" FOREIGN KEY ("ledger_entry_id") REFERENCES "ledger_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_raw_material_id_fkey" FOREIGN KEY ("raw_material_id") REFERENCES "raw_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
