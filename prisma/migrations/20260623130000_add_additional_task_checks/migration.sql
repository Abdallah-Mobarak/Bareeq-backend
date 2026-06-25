-- CreateTable
CREATE TABLE "additional_task_checks" (
    "id" TEXT NOT NULL,
    "additional_task_id" TEXT NOT NULL,
    "title_ar" TEXT NOT NULL,
    "title_en" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "additional_task_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "additional_task_checks_additional_task_id_idx" ON "additional_task_checks"("additional_task_id");

-- AddForeignKey
ALTER TABLE "additional_task_checks" ADD CONSTRAINT "additional_task_checks_additional_task_id_fkey" FOREIGN KEY ("additional_task_id") REFERENCES "additional_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
