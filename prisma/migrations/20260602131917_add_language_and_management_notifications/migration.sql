-- CreateEnum
CREATE TYPE "Language" AS ENUM ('AR', 'EN');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'SCHEDULE_PUBLISHED';
ALTER TYPE "NotificationType" ADD VALUE 'VISIT_ASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE 'VISIT_STATUS_CHANGED';
ALTER TYPE "NotificationType" ADD VALUE 'MONTHLY_REPORT_AVAILABLE';
ALTER TYPE "NotificationType" ADD VALUE 'ADDITIONAL_TASK_ASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE 'VISIT_MISSED';
ALTER TYPE "NotificationType" ADD VALUE 'CONTACT_REPLIED';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "preferred_language" "Language" NOT NULL DEFAULT 'AR';
