-- AlterTable
ALTER TABLE "additional_tasks" ADD COLUMN     "duration_seconds" INTEGER,
ADD COLUMN     "ended_at" TIMESTAMP(3),
ADD COLUMN     "locked_at" TIMESTAMP(3),
ADD COLUMN     "not_implemented_note" TEXT,
ADD COLUMN     "not_implemented_reason_id" TEXT,
ADD COLUMN     "start_latitude" DECIMAL(65,30),
ADD COLUMN     "start_longitude" DECIMAL(65,30),
ADD COLUMN     "started_at" TIMESTAMP(3),
ADD COLUMN     "visit_note" TEXT;

-- AddForeignKey
ALTER TABLE "additional_tasks" ADD CONSTRAINT "additional_tasks_not_implemented_reason_id_fkey" FOREIGN KEY ("not_implemented_reason_id") REFERENCES "not_implemented_reasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
