-- CreateEnum
CREATE TYPE "WithdrawalMethod" AS ENUM ('BANK', 'EWALLET');

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "cash_received_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "service_providers" ADD COLUMN     "service_category_id" TEXT;

-- AlterTable
ALTER TABLE "withdrawal_requests" ADD COLUMN     "method" "WithdrawalMethod" NOT NULL DEFAULT 'BANK',
ADD COLUMN     "wallet_id" TEXT,
ADD COLUMN     "wallet_name" TEXT,
ALTER COLUMN "bank_name" DROP NOT NULL,
ALTER COLUMN "bank_account_iban" DROP NOT NULL,
ALTER COLUMN "account_holder_name" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "service_providers_service_category_id_idx" ON "service_providers"("service_category_id");

-- AddForeignKey
ALTER TABLE "service_providers" ADD CONSTRAINT "service_providers_service_category_id_fkey" FOREIGN KEY ("service_category_id") REFERENCES "service_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
