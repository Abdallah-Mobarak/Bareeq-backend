-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "manager_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "statement" TEXT,
    "website" TEXT,
    "price" DECIMAL(65,30),
    "date" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "contract_type" TEXT,
    "tax_type" TEXT,
    "contract_status" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "car_cases" (
    "id" TEXT NOT NULL,
    "manager_id" TEXT NOT NULL,
    "supervisor_id" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "license_plate" TEXT NOT NULL,
    "vehicle_condition" TEXT NOT NULL,
    "oil_change_date" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "car_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "representatives" (
    "id" TEXT NOT NULL,
    "manager_id" TEXT NOT NULL,
    "client_name" TEXT NOT NULL,
    "service_type" TEXT NOT NULL,
    "hourly_rate" DECIMAL(65,30) NOT NULL,
    "number_of_workers" INTEGER NOT NULL,
    "number_of_hours" DECIMAL(65,30) NOT NULL,
    "price" DECIMAL(65,30) NOT NULL,
    "date_of_agreement" TIMESTAMP(3) NOT NULL,
    "customer_phone_number" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "representatives_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clients_manager_id_idx" ON "clients"("manager_id");

-- CreateIndex
CREATE INDEX "clients_name_idx" ON "clients"("name");

-- CreateIndex
CREATE INDEX "clients_date_idx" ON "clients"("date");

-- CreateIndex
CREATE INDEX "clients_contract_status_idx" ON "clients"("contract_status");

-- CreateIndex
CREATE INDEX "clients_deleted_at_idx" ON "clients"("deleted_at");

-- CreateIndex
CREATE INDEX "car_cases_manager_id_idx" ON "car_cases"("manager_id");

-- CreateIndex
CREATE INDEX "car_cases_supervisor_id_idx" ON "car_cases"("supervisor_id");

-- CreateIndex
CREATE INDEX "car_cases_area_idx" ON "car_cases"("area");

-- CreateIndex
CREATE INDEX "car_cases_license_plate_idx" ON "car_cases"("license_plate");

-- CreateIndex
CREATE INDEX "car_cases_deleted_at_idx" ON "car_cases"("deleted_at");

-- CreateIndex
CREATE INDEX "representatives_manager_id_idx" ON "representatives"("manager_id");

-- CreateIndex
CREATE INDEX "representatives_client_name_idx" ON "representatives"("client_name");

-- CreateIndex
CREATE INDEX "representatives_date_of_agreement_idx" ON "representatives"("date_of_agreement");

-- CreateIndex
CREATE INDEX "representatives_deleted_at_idx" ON "representatives"("deleted_at");

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "car_cases" ADD CONSTRAINT "car_cases_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "car_cases" ADD CONSTRAINT "car_cases_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "representatives" ADD CONSTRAINT "representatives_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
