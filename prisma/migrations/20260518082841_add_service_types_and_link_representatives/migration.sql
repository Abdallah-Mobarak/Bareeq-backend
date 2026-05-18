-- Migration: add_service_types_and_link_representatives
--
-- This migration was hand-edited from the Prisma auto-generated version.
-- The auto version tried to ADD a NOT NULL `service_type_id` and DROP the
-- old `service_type` / `hourly_rate` columns in a single ALTER TABLE,
-- which fails on tables that already have rows.
--
-- Strategy (zero-data-loss):
--   1. Create the new `service_types` table (catalog).
--   2. Add `service_type_id` as NULLABLE so the column can be backfilled.
--   3. Backfill: insert one `service_types` row per DISTINCT
--      (service_type, hourly_rate) pair found in `representatives`, then
--      link each representative to its matching ServiceType.
--   4. Promote `service_type_id` to NOT NULL once every row is linked.
--   5. Add the FK + index on the new column.
--   6. Drop the now-redundant `service_type` and `hourly_rate` columns.
--
-- The backfill IDs use md5(service_type || '|' || hourly_rate) so they are
-- deterministic and unique per pair, without needing pgcrypto/uuid-ossp.

-- 1. CreateTable: service_types
CREATE TABLE "service_types" (
    "id" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT,
    "hourly_rate" DECIMAL(65,30) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "service_types_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "service_types_deleted_at_idx" ON "service_types"("deleted_at");

-- 2. Add the FK column as NULLABLE so existing rows survive
ALTER TABLE "representatives" ADD COLUMN "service_type_id" TEXT;

-- 3a. Backfill: one ServiceType per distinct (service_type, hourly_rate)
INSERT INTO "service_types" ("id", "name_ar", "name_en", "hourly_rate", "created_at", "updated_at")
SELECT
    'st_' || md5(src."service_type" || '|' || src."hourly_rate"::text),
    src."service_type",
    NULL,
    src."hourly_rate",
    NOW(),
    NOW()
FROM (
    SELECT DISTINCT "service_type", "hourly_rate" FROM "representatives"
) AS src;

-- 3b. Link each representative to its matching ServiceType row
UPDATE "representatives" r
SET "service_type_id" = st."id"
FROM "service_types" st
WHERE st."name_ar" = r."service_type"
  AND st."hourly_rate" = r."hourly_rate";

-- 4. Now every row has a value, enforce NOT NULL
ALTER TABLE "representatives" ALTER COLUMN "service_type_id" SET NOT NULL;

-- 5. Add the FK + index
ALTER TABLE "representatives" ADD CONSTRAINT "representatives_service_type_id_fkey"
    FOREIGN KEY ("service_type_id") REFERENCES "service_types"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "representatives_service_type_id_idx" ON "representatives"("service_type_id");

-- 6. Drop the old denormalised columns now that the data has moved
ALTER TABLE "representatives" DROP COLUMN "service_type";
ALTER TABLE "representatives" DROP COLUMN "hourly_rate";
