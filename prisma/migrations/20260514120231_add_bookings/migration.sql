-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REJECTED');

-- CreateEnum
CREATE TYPE "BookingPaymentMethod" AS ENUM ('CASH', 'WALLET', 'ONLINE');

-- CreateEnum
CREATE TYPE "BookingPaymentStatus" AS ENUM ('PENDING', 'PAID', 'REFUNDED');

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "assigned_sp_id" TEXT,
    "description" TEXT,
    "location_lat" DECIMAL(10,7),
    "location_lng" DECIMAL(10,7),
    "location_address" TEXT,
    "scheduled_date" TIMESTAMP(3) NOT NULL,
    "total_cost" DECIMAL(12,2) NOT NULL,
    "commission_rate" DECIMAL(5,2),
    "commission_amount" DECIMAL(12,2),
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "paymentMethod" "BookingPaymentMethod" NOT NULL,
    "paymentStatus" "BookingPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "approved_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancellation_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_subcategories" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "subcategory_id" TEXT NOT NULL,
    "title_ar" TEXT NOT NULL,
    "title_en" TEXT,
    "cost" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_subcategories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bookings_customer_id_status_idx" ON "bookings"("customer_id", "status");

-- CreateIndex
CREATE INDEX "bookings_assigned_sp_id_status_idx" ON "bookings"("assigned_sp_id", "status");

-- CreateIndex
CREATE INDEX "bookings_status_created_at_idx" ON "bookings"("status", "created_at");

-- CreateIndex
CREATE INDEX "bookings_service_id_idx" ON "bookings"("service_id");

-- CreateIndex
CREATE INDEX "booking_subcategories_booking_id_idx" ON "booking_subcategories"("booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "booking_subcategories_booking_id_subcategory_id_key" ON "booking_subcategories"("booking_id", "subcategory_id");

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_assigned_sp_id_fkey" FOREIGN KEY ("assigned_sp_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_subcategories" ADD CONSTRAINT "booking_subcategories_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_subcategories" ADD CONSTRAINT "booking_subcategories_subcategory_id_fkey" FOREIGN KEY ("subcategory_id") REFERENCES "service_subcategories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
