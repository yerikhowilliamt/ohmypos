-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('COMPLETED', 'VOIDED');

-- AlterEnum
ALTER TYPE "LedgerSourceType" ADD VALUE 'SALE_VOID';

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "status" "SaleStatus" NOT NULL DEFAULT 'COMPLETED',
ADD COLUMN     "voided_at" TIMESTAMP(3),
ADD COLUMN     "voided_by_user_id" TEXT;

-- CreateIndex
CREATE INDEX "sales_status_idx" ON "sales"("status");

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_voided_by_user_id_fkey" FOREIGN KEY ("voided_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
