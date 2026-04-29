-- CreateEnum
CREATE TYPE "ScheduledVisitType" AS ENUM ('REGULAR', 'ADDITIONAL');

-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('REMAINING', 'UNDERWAY', 'IMPLEMENTED', 'NOT_IMPLEMENTED', 'FINAL_CLOSED');

-- CreateEnum
CREATE TYPE "DocumentationStatus" AS ENUM ('DOCUMENTED', 'UNDOCUMENTED');

-- CreateTable
CREATE TABLE "monthly_schedules" (
    "id" TEXT NOT NULL,
    "supervisor_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "monthly_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_visits" (
    "id" TEXT NOT NULL,
    "type" "ScheduledVisitType" NOT NULL,
    "monthly_schedule_id" TEXT,
    "assigned_by_manager_id" TEXT,
    "assigned_to_supervisor_id" TEXT,
    "branch_id" TEXT NOT NULL,
    "number_of_visits" INTEGER NOT NULL DEFAULT 1,
    "first_visit_date" DATE NOT NULL,
    "price" DECIMAL(65,30),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "scheduled_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_instances" (
    "id" TEXT NOT NULL,
    "scheduled_visit_id" TEXT NOT NULL,
    "visit_order" INTEGER NOT NULL,
    "scheduled_date" DATE NOT NULL,
    "status" "VisitStatus" NOT NULL DEFAULT 'REMAINING',
    "documentation_status" "DocumentationStatus" NOT NULL DEFAULT 'UNDOCUMENTED',
    "not_implemented_reason_id" TEXT,
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "duration_seconds" INTEGER,
    "start_latitude" DECIMAL(65,30),
    "start_longitude" DECIMAL(65,30),
    "branch_manager_phone" TEXT,
    "locked_at" TIMESTAMP(3),
    "cascaded_from_visit_instance_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "visit_instances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "monthly_schedules_deleted_at_idx" ON "monthly_schedules"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_schedules_supervisor_id_year_month_key" ON "monthly_schedules"("supervisor_id", "year", "month");

-- CreateIndex
CREATE INDEX "scheduled_visits_monthly_schedule_id_idx" ON "scheduled_visits"("monthly_schedule_id");

-- CreateIndex
CREATE INDEX "scheduled_visits_branch_id_idx" ON "scheduled_visits"("branch_id");

-- CreateIndex
CREATE INDEX "scheduled_visits_type_idx" ON "scheduled_visits"("type");

-- CreateIndex
CREATE INDEX "scheduled_visits_assigned_to_supervisor_id_idx" ON "scheduled_visits"("assigned_to_supervisor_id");

-- CreateIndex
CREATE INDEX "scheduled_visits_deleted_at_idx" ON "scheduled_visits"("deleted_at");

-- CreateIndex
CREATE INDEX "visit_instances_scheduled_date_idx" ON "visit_instances"("scheduled_date");

-- CreateIndex
CREATE INDEX "visit_instances_status_idx" ON "visit_instances"("status");

-- CreateIndex
CREATE INDEX "visit_instances_locked_at_idx" ON "visit_instances"("locked_at");

-- CreateIndex
CREATE INDEX "visit_instances_deleted_at_idx" ON "visit_instances"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "visit_instances_scheduled_visit_id_visit_order_key" ON "visit_instances"("scheduled_visit_id", "visit_order");

-- AddForeignKey
ALTER TABLE "monthly_schedules" ADD CONSTRAINT "monthly_schedules_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_visits" ADD CONSTRAINT "scheduled_visits_monthly_schedule_id_fkey" FOREIGN KEY ("monthly_schedule_id") REFERENCES "monthly_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_visits" ADD CONSTRAINT "scheduled_visits_assigned_by_manager_id_fkey" FOREIGN KEY ("assigned_by_manager_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_visits" ADD CONSTRAINT "scheduled_visits_assigned_to_supervisor_id_fkey" FOREIGN KEY ("assigned_to_supervisor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_visits" ADD CONSTRAINT "scheduled_visits_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_instances" ADD CONSTRAINT "visit_instances_scheduled_visit_id_fkey" FOREIGN KEY ("scheduled_visit_id") REFERENCES "scheduled_visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_instances" ADD CONSTRAINT "visit_instances_not_implemented_reason_id_fkey" FOREIGN KEY ("not_implemented_reason_id") REFERENCES "not_implemented_reasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_instances" ADD CONSTRAINT "visit_instances_cascaded_from_visit_instance_id_fkey" FOREIGN KEY ("cascaded_from_visit_instance_id") REFERENCES "visit_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;
