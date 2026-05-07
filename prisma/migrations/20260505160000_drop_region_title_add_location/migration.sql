-- AlterTable
ALTER TABLE "region_schedulings" DROP COLUMN "region_title";
ALTER TABLE "region_schedulings" ADD COLUMN "location" TEXT;
