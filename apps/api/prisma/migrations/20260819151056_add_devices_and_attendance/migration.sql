-- CreateEnum
CREATE TYPE "AttendanceViolationReason" AS ENUM ('NO_DEVICE_COOKIE', 'DEVICE_NOT_REGISTERED', 'DEVICE_WRONG_BRANCH', 'DEVICE_INACTIVE');

-- CreateTable
CREATE TABLE "devices" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "activated_by_user_id" TEXT,
    "activated_at" TIMESTAMP(3),
    "activation_code" TEXT,
    "activation_code_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "device_id" TEXT,
    "login_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_valid" BOOLEAN NOT NULL,
    "violation_reason" "AttendanceViolationReason",
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "devices_activation_code_key" ON "devices"("activation_code");

-- CreateIndex
CREATE INDEX "devices_branch_id_idx" ON "devices"("branch_id");

-- CreateIndex
CREATE INDEX "attendance_records_user_id_idx" ON "attendance_records"("user_id");

-- CreateIndex
CREATE INDEX "attendance_records_device_id_idx" ON "attendance_records"("device_id");

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_activated_by_user_id_fkey" FOREIGN KEY ("activated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
