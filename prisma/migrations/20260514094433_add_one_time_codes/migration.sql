-- CreateEnum
CREATE TYPE "OneTimeCodePurpose" AS ENUM ('CUSTOMER_SIGNUP', 'SERVICE_PROVIDER_SIGNUP', 'CUSTOMER_PASSWORD_RESET', 'SERVICE_PROVIDER_PASSWORD_RESET');

-- CreateTable
CREATE TABLE "one_time_codes" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "purpose" "OneTimeCodePurpose" NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "one_time_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "one_time_codes_identifier_purpose_idx" ON "one_time_codes"("identifier", "purpose");

-- CreateIndex
CREATE INDEX "one_time_codes_expires_at_idx" ON "one_time_codes"("expires_at");
