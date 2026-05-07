-- AlterTable
ALTER TABLE "visit_instances" ADD COLUMN     "comments" TEXT,
ADD COLUMN     "documentation_otp_hash" TEXT,
ADD COLUMN     "documentation_token" TEXT,
ADD COLUMN     "documented_at" TIMESTAMP(3),
ADD COLUMN     "job_number" TEXT,
ADD COLUMN     "otp_expires_at" TIMESTAMP(3),
ADD COLUMN     "rating" INTEGER;

-- CreateTable
CREATE TABLE "visit_instance_photos" (
    "id" TEXT NOT NULL,
    "visit_instance_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "size_bytes" INTEGER,
    "mime_type" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "visit_instance_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_instance_task_checks" (
    "id" TEXT NOT NULL,
    "visit_instance_id" TEXT NOT NULL,
    "region_scheduling_task_id" TEXT,
    "title_ar" TEXT NOT NULL,
    "title_en" TEXT,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visit_instance_task_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "visit_instance_photos_visit_instance_id_idx" ON "visit_instance_photos"("visit_instance_id");

-- CreateIndex
CREATE INDEX "visit_instance_task_checks_visit_instance_id_idx" ON "visit_instance_task_checks"("visit_instance_id");

-- CreateIndex
CREATE UNIQUE INDEX "visit_instances_documentation_token_key" ON "visit_instances"("documentation_token");

-- AddForeignKey
ALTER TABLE "visit_instance_photos" ADD CONSTRAINT "visit_instance_photos_visit_instance_id_fkey" FOREIGN KEY ("visit_instance_id") REFERENCES "visit_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_instance_task_checks" ADD CONSTRAINT "visit_instance_task_checks_visit_instance_id_fkey" FOREIGN KEY ("visit_instance_id") REFERENCES "visit_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_instance_task_checks" ADD CONSTRAINT "visit_instance_task_checks_region_scheduling_task_id_fkey" FOREIGN KEY ("region_scheduling_task_id") REFERENCES "region_scheduling_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
