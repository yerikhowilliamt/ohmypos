ALTER TABLE "sales"               ADD COLUMN "idempotency_key" TEXT;
ALTER TABLE "supplier_purchases"  ADD COLUMN "idempotency_key" TEXT;
ALTER TABLE "payable_settlements" ADD COLUMN "idempotency_key" TEXT;

CREATE UNIQUE INDEX "sales_idempotency_key_key"               ON "sales"("idempotency_key");
CREATE UNIQUE INDEX "supplier_purchases_idempotency_key_key"  ON "supplier_purchases"("idempotency_key");
CREATE UNIQUE INDEX "payable_settlements_idempotency_key_key" ON "payable_settlements"("idempotency_key");
