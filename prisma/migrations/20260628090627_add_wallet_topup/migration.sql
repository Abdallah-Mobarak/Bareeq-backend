-- CreateEnum
CREATE TYPE "TopupStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "wallet_topups" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "status" "TopupStatus" NOT NULL DEFAULT 'PENDING',
    "cart_id" TEXT NOT NULL,
    "tran_ref" TEXT,
    "payment_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallet_topups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wallet_topups_cart_id_key" ON "wallet_topups"("cart_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_topups_tran_ref_key" ON "wallet_topups"("tran_ref");

-- CreateIndex
CREATE INDEX "wallet_topups_customer_id_idx" ON "wallet_topups"("customer_id");

-- CreateIndex
CREATE INDEX "wallet_topups_status_idx" ON "wallet_topups"("status");
