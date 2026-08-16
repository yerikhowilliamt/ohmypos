-- CreateTable
CREATE TABLE "opening_stocks" (
    "id" TEXT NOT NULL,
    "raw_material_id" TEXT NOT NULL,
    "period_month" DATE NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit_price" DECIMAL(18,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opening_stocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "opening_stocks_period_month_idx" ON "opening_stocks"("period_month");

-- CreateIndex
CREATE UNIQUE INDEX "opening_stocks_raw_material_id_period_month_key" ON "opening_stocks"("raw_material_id", "period_month");

-- AddForeignKey
ALTER TABLE "opening_stocks" ADD CONSTRAINT "opening_stocks_raw_material_id_fkey" FOREIGN KEY ("raw_material_id") REFERENCES "raw_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
