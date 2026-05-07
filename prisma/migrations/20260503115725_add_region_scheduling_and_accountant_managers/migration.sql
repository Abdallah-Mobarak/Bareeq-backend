/*
  Warnings:

  - You are about to drop the column `branch_id` on the `scheduled_visits` table. All the data in the column will be lost.
  - Added the required column `region_scheduling_id` to the `scheduled_visits` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
ALTER TYPE "SystemRole" ADD VALUE 'ACCOUNTANT_MANAGER';

-- DropForeignKey
ALTER TABLE "scheduled_visits" DROP CONSTRAINT "scheduled_visits_branch_id_fkey";

-- DropIndex
DROP INDEX "scheduled_visits_branch_id_idx";

-- AlterTable
ALTER TABLE "scheduled_visits" DROP COLUMN "branch_id",
ADD COLUMN     "region_scheduling_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "assigned_to_all_branches" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "region_schedulings" (
    "id" TEXT NOT NULL,
    "region_title" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "branch_name" TEXT NOT NULL,
    "category_name" TEXT,
    "branch_number" TEXT,
    "city" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "address" TEXT,
    "latitude" DECIMAL(65,30),
    "longitude" DECIMAL(65,30),
    "number_of_visits" INTEGER NOT NULL DEFAULT 1,
    "code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "region_schedulings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "region_scheduling_tasks" (
    "id" TEXT NOT NULL,
    "region_scheduling_id" TEXT NOT NULL,
    "visit_type" INTEGER NOT NULL,
    "title_ar" TEXT NOT NULL,
    "title_en" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "region_scheduling_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accountant_manager_region_schedulings" (
    "user_id" TEXT NOT NULL,
    "region_scheduling_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accountant_manager_region_schedulings_pkey" PRIMARY KEY ("user_id","region_scheduling_id")
);

-- CreateTable
CREATE TABLE "manager_tasks" (
    "id" TEXT NOT NULL,
    "manager_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "manager_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "region_schedulings_company_name_idx" ON "region_schedulings"("company_name");

-- CreateIndex
CREATE INDEX "region_schedulings_city_idx" ON "region_schedulings"("city");

-- CreateIndex
CREATE INDEX "region_schedulings_region_idx" ON "region_schedulings"("region");

-- CreateIndex
CREATE INDEX "region_schedulings_code_idx" ON "region_schedulings"("code");

-- CreateIndex
CREATE INDEX "region_schedulings_deleted_at_idx" ON "region_schedulings"("deleted_at");

-- CreateIndex
CREATE INDEX "region_scheduling_tasks_region_scheduling_id_visit_type_idx" ON "region_scheduling_tasks"("region_scheduling_id", "visit_type");

-- CreateIndex
CREATE INDEX "accountant_manager_region_schedulings_region_scheduling_id_idx" ON "accountant_manager_region_schedulings"("region_scheduling_id");

-- CreateIndex
CREATE INDEX "manager_tasks_manager_id_idx" ON "manager_tasks"("manager_id");

-- CreateIndex
CREATE INDEX "manager_tasks_done_idx" ON "manager_tasks"("done");

-- CreateIndex
CREATE INDEX "manager_tasks_deleted_at_idx" ON "manager_tasks"("deleted_at");

-- CreateIndex
CREATE INDEX "scheduled_visits_region_scheduling_id_idx" ON "scheduled_visits"("region_scheduling_id");

-- AddForeignKey
ALTER TABLE "region_scheduling_tasks" ADD CONSTRAINT "region_scheduling_tasks_region_scheduling_id_fkey" FOREIGN KEY ("region_scheduling_id") REFERENCES "region_schedulings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accountant_manager_region_schedulings" ADD CONSTRAINT "accountant_manager_region_schedulings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accountant_manager_region_schedulings" ADD CONSTRAINT "accountant_manager_region_schedulings_region_scheduling_id_fkey" FOREIGN KEY ("region_scheduling_id") REFERENCES "region_schedulings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manager_tasks" ADD CONSTRAINT "manager_tasks_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_visits" ADD CONSTRAINT "scheduled_visits_region_scheduling_id_fkey" FOREIGN KEY ("region_scheduling_id") REFERENCES "region_schedulings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
