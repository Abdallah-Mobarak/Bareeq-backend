-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "broadcast_id" TEXT;

-- CreateTable
CREATE TABLE "notification_broadcasts" (
    "id" TEXT NOT NULL,
    "sent_by_admin_id" TEXT NOT NULL,
    "title_ar" TEXT NOT NULL,
    "title_en" TEXT,
    "body_ar" TEXT NOT NULL,
    "body_en" TEXT,
    "audience" JSONB NOT NULL,
    "recipient_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "notification_broadcasts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_broadcasts_sent_by_admin_id_idx" ON "notification_broadcasts"("sent_by_admin_id");

-- CreateIndex
CREATE INDEX "notification_broadcasts_deleted_at_idx" ON "notification_broadcasts"("deleted_at");

-- CreateIndex
CREATE INDEX "notifications_broadcast_id_idx" ON "notifications"("broadcast_id");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_broadcast_id_fkey" FOREIGN KEY ("broadcast_id") REFERENCES "notification_broadcasts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_broadcasts" ADD CONSTRAINT "notification_broadcasts_sent_by_admin_id_fkey" FOREIGN KEY ("sent_by_admin_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
