-- Migration: add_lookups
--
-- Replaces six free-text columns scattered across `clients` and
-- `car_cases` with FKs into a shared `lookups` table (FRD §4.9.2 +
-- §4.10.2). Hand-written to guarantee zero-data-loss when there are
-- already rows in `clients` / `car_cases`.
--
-- Strategy (mirrors the ServiceType migration):
--   1. Create LookupType enum + lookups table.
--   2. Add NULLABLE FK columns alongside the existing text columns.
--   3. Backfill: one Lookup row per DISTINCT (type, text), then
--      link each parent row to the matching Lookup.
--   4. Promote the CarCase FK columns to NOT NULL (Client stays
--      nullable to match FRD §3.7.2 "select from admin-managed list").
--   5. Add FK + indexes, drop the old text columns.
--
-- Lookup IDs use md5(type || '|' || value) so backfill is idempotent
-- and deterministic — re-running on the same data produces the same
-- IDs.

-- ── 1. Enum + table ──────────────────────────────────────────────────
CREATE TYPE "LookupType" AS ENUM (
    'CONTRACT_TYPE',
    'TAX_TYPE',
    'CONTRACT_STATUS',
    'AREA',
    'LICENSE_PLATE',
    'VEHICLE_CONDITION'
);

CREATE TABLE "lookups" (
    "id" TEXT NOT NULL,
    "type" "LookupType" NOT NULL,
    "title_ar" TEXT NOT NULL,
    "title_en" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "lookups_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "lookups_type_deleted_at_sort_order_idx"
    ON "lookups"("type", "deleted_at", "sort_order");

-- ── 2. Add nullable FK columns (alongside existing text columns) ────
ALTER TABLE "clients"
    ADD COLUMN "contract_type_id"   TEXT,
    ADD COLUMN "tax_type_id"        TEXT,
    ADD COLUMN "contract_status_id" TEXT;

ALTER TABLE "car_cases"
    ADD COLUMN "area_id"              TEXT,
    ADD COLUMN "license_plate_id"     TEXT,
    ADD COLUMN "vehicle_condition_id" TEXT;

-- ── 3a. Seed Lookup rows from existing text values ──────────────────
-- One row per DISTINCT (type, text). The id is deterministic so
-- re-running the migration on the same data would map to the same
-- Lookup ids.

-- Clients (contract_type, tax_type, contract_status)
INSERT INTO "lookups" ("id", "type", "title_ar", "title_en", "created_at", "updated_at")
SELECT
    'lk_' || md5('CONTRACT_TYPE|' || src."contract_type"),
    'CONTRACT_TYPE',
    src."contract_type",
    NULL,
    NOW(),
    NOW()
FROM (SELECT DISTINCT "contract_type" FROM "clients" WHERE "contract_type" IS NOT NULL) AS src;

INSERT INTO "lookups" ("id", "type", "title_ar", "title_en", "created_at", "updated_at")
SELECT
    'lk_' || md5('TAX_TYPE|' || src."tax_type"),
    'TAX_TYPE',
    src."tax_type",
    NULL,
    NOW(),
    NOW()
FROM (SELECT DISTINCT "tax_type" FROM "clients" WHERE "tax_type" IS NOT NULL) AS src;

INSERT INTO "lookups" ("id", "type", "title_ar", "title_en", "created_at", "updated_at")
SELECT
    'lk_' || md5('CONTRACT_STATUS|' || src."contract_status"),
    'CONTRACT_STATUS',
    src."contract_status",
    NULL,
    NOW(),
    NOW()
FROM (SELECT DISTINCT "contract_status" FROM "clients" WHERE "contract_status" IS NOT NULL) AS src;

-- Car cases (area, license_plate, vehicle_condition)
INSERT INTO "lookups" ("id", "type", "title_ar", "title_en", "created_at", "updated_at")
SELECT
    'lk_' || md5('AREA|' || src."area"),
    'AREA',
    src."area",
    NULL,
    NOW(),
    NOW()
FROM (SELECT DISTINCT "area" FROM "car_cases") AS src;

INSERT INTO "lookups" ("id", "type", "title_ar", "title_en", "created_at", "updated_at")
SELECT
    'lk_' || md5('LICENSE_PLATE|' || src."license_plate"),
    'LICENSE_PLATE',
    src."license_plate",
    NULL,
    NOW(),
    NOW()
FROM (SELECT DISTINCT "license_plate" FROM "car_cases") AS src;

INSERT INTO "lookups" ("id", "type", "title_ar", "title_en", "created_at", "updated_at")
SELECT
    'lk_' || md5('VEHICLE_CONDITION|' || src."vehicle_condition"),
    'VEHICLE_CONDITION',
    src."vehicle_condition",
    NULL,
    NOW(),
    NOW()
FROM (SELECT DISTINCT "vehicle_condition" FROM "car_cases") AS src;

-- ── 3b. Link parent rows to their matching Lookup ───────────────────
UPDATE "clients" c
SET "contract_type_id" = 'lk_' || md5('CONTRACT_TYPE|' || c."contract_type")
WHERE c."contract_type" IS NOT NULL;

UPDATE "clients" c
SET "tax_type_id" = 'lk_' || md5('TAX_TYPE|' || c."tax_type")
WHERE c."tax_type" IS NOT NULL;

UPDATE "clients" c
SET "contract_status_id" = 'lk_' || md5('CONTRACT_STATUS|' || c."contract_status")
WHERE c."contract_status" IS NOT NULL;

UPDATE "car_cases" cc
SET "area_id"              = 'lk_' || md5('AREA|' || cc."area"),
    "license_plate_id"     = 'lk_' || md5('LICENSE_PLATE|' || cc."license_plate"),
    "vehicle_condition_id" = 'lk_' || md5('VEHICLE_CONDITION|' || cc."vehicle_condition");

-- ── 4. Promote CarCase FK columns to NOT NULL ───────────────────────
-- Clients stay nullable per FRD §3.7.2 (admin picks optionally).
ALTER TABLE "car_cases"
    ALTER COLUMN "area_id"              SET NOT NULL,
    ALTER COLUMN "license_plate_id"     SET NOT NULL,
    ALTER COLUMN "vehicle_condition_id" SET NOT NULL;

-- ── 5. Indexes + FK constraints ─────────────────────────────────────
DROP INDEX "car_cases_area_idx";
DROP INDEX "car_cases_license_plate_idx";
DROP INDEX "clients_contract_status_idx";

CREATE INDEX "car_cases_area_id_idx"          ON "car_cases"("area_id");
CREATE INDEX "car_cases_license_plate_id_idx" ON "car_cases"("license_plate_id");
CREATE INDEX "clients_contract_status_id_idx" ON "clients"("contract_status_id");

ALTER TABLE "clients" ADD CONSTRAINT "clients_contract_type_id_fkey"
    FOREIGN KEY ("contract_type_id") REFERENCES "lookups"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "clients" ADD CONSTRAINT "clients_tax_type_id_fkey"
    FOREIGN KEY ("tax_type_id") REFERENCES "lookups"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "clients" ADD CONSTRAINT "clients_contract_status_id_fkey"
    FOREIGN KEY ("contract_status_id") REFERENCES "lookups"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "car_cases" ADD CONSTRAINT "car_cases_area_id_fkey"
    FOREIGN KEY ("area_id") REFERENCES "lookups"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "car_cases" ADD CONSTRAINT "car_cases_license_plate_id_fkey"
    FOREIGN KEY ("license_plate_id") REFERENCES "lookups"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "car_cases" ADD CONSTRAINT "car_cases_vehicle_condition_id_fkey"
    FOREIGN KEY ("vehicle_condition_id") REFERENCES "lookups"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 6. Drop old text columns now that all data has moved ────────────
ALTER TABLE "clients"
    DROP COLUMN "contract_type",
    DROP COLUMN "tax_type",
    DROP COLUMN "contract_status";

ALTER TABLE "car_cases"
    DROP COLUMN "area",
    DROP COLUMN "license_plate",
    DROP COLUMN "vehicle_condition";
