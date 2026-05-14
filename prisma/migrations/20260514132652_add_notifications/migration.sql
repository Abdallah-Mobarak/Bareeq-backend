-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('CUSTOMER_WELCOME', 'SERVICE_PROVIDER_WELCOME', 'ACCOUNT_BLOCKED', 'ACCOUNT_UNBLOCKED', 'KYC_APPROVED', 'KYC_REJECTED', 'BOOKING_ACCEPTED', 'BOOKING_STARTED', 'BOOKING_COMPLETED', 'REVIEW_RECEIVED', 'SYSTEM_ANNOUNCEMENT');

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title_ar" TEXT NOT NULL,
    "title_en" TEXT,
    "body_ar" TEXT,
    "body_en" TEXT,
    "data" JSONB,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
