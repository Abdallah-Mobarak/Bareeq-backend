-- CreateTable
CREATE TABLE "additional_tasks" (
    "id" TEXT NOT NULL,
    "manager_id" TEXT NOT NULL,
    "supervisor_id" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "branch_name" TEXT,
    "category_name" TEXT,
    "address" TEXT NOT NULL,
    "location" TEXT,
    "latitude" DECIMAL(65,30),
    "longitude" DECIMAL(65,30),
    "visit_date" TIMESTAMP(3) NOT NULL,
    "price" DECIMAL(65,30),
    "notes" TEXT,
    "status" "VisitStatus" NOT NULL DEFAULT 'REMAINING',
    "documentationStatus" "DocumentationStatus" NOT NULL DEFAULT 'UNDOCUMENTED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "additional_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "additional_tasks_manager_id_idx" ON "additional_tasks"("manager_id");

-- CreateIndex
CREATE INDEX "additional_tasks_supervisor_id_idx" ON "additional_tasks"("supervisor_id");

-- CreateIndex
CREATE INDEX "additional_tasks_visit_date_idx" ON "additional_tasks"("visit_date");

-- CreateIndex
CREATE INDEX "additional_tasks_status_idx" ON "additional_tasks"("status");

-- CreateIndex
CREATE INDEX "additional_tasks_deleted_at_idx" ON "additional_tasks"("deleted_at");

-- AddForeignKey
ALTER TABLE "additional_tasks" ADD CONSTRAINT "additional_tasks_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "additional_tasks" ADD CONSTRAINT "additional_tasks_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
