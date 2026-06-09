-- CreateTable
CREATE TABLE "booking_dismissals" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "sp_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_dismissals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "booking_dismissals_sp_id_idx" ON "booking_dismissals"("sp_id");

-- CreateIndex
CREATE UNIQUE INDEX "booking_dismissals_booking_id_sp_id_key" ON "booking_dismissals"("booking_id", "sp_id");

-- AddForeignKey
ALTER TABLE "booking_dismissals" ADD CONSTRAINT "booking_dismissals_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_dismissals" ADD CONSTRAINT "booking_dismissals_sp_id_fkey" FOREIGN KEY ("sp_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
