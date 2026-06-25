-- AlterTable
ALTER TABLE "additional_tasks" ADD COLUMN     "branch_manager_phone" TEXT,
ADD COLUMN     "comments" TEXT,
ADD COLUMN     "documentation_otp_hash" TEXT,
ADD COLUMN     "documentation_token" TEXT,
ADD COLUMN     "documented_at" TIMESTAMP(3),
ADD COLUMN     "job_number" TEXT,
ADD COLUMN     "otp_expires_at" TIMESTAMP(3),
ADD COLUMN     "rating" INTEGER;

-- CreateTable
CREATE TABLE "additional_task_photos" (
    "id" TEXT NOT NULL,
    "additional_task_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "size_bytes" INTEGER,
    "mime_type" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "additional_task_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "additional_tasks_documentation_token_key" ON "additional_tasks"("documentation_token");

-- CreateIndex
CREATE INDEX "additional_task_photos_additional_task_id_idx" ON "additional_task_photos"("additional_task_id");

-- AddForeignKey
ALTER TABLE "additional_task_photos" ADD CONSTRAINT "additional_task_photos_additional_task_id_fkey" FOREIGN KEY ("additional_task_id") REFERENCES "additional_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
