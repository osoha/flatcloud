-- FlatCloud V21.3.1 hotfix - restart-safe lease lifecycle migration.
-- Legacy Lease.status and Unit.status remain compatibility caches for a safe rolling deploy.
-- Every schema operation below is safe to retry after a partially failed PostgreSQL migration.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'UnitOperationalStatus' AND n.nspname = current_schema()
  ) THEN
    CREATE TYPE "UnitOperationalStatus" AS ENUM ('STANDARD', 'RENOVATION', 'INACTIVE');
  END IF;
END $$;

ALTER TABLE "Unit"
  ADD COLUMN IF NOT EXISTS "operationalStatus" "UnitOperationalStatus" NOT NULL DEFAULT 'STANDARD';

-- Backfill only from meaningful legacy operational values. Re-running never downgrades an
-- already explicit RENOVATION/INACTIVE value to STANDARD.
UPDATE "Unit"
SET "operationalStatus" = CASE
  WHEN "status" = 'RENOVATION' THEN 'RENOVATION'::"UnitOperationalStatus"
  WHEN "status" = 'INACTIVE' THEN 'INACTIVE'::"UnitOperationalStatus"
  ELSE "operationalStatus"
END;

ALTER TABLE "Lease"
  ADD COLUMN IF NOT EXISTS "terminatedOn" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "terminationReason" TEXT,
  ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancellationReason" TEXT;

-- A legacy ENDED contract whose start was still in the future was effectively cancelled
-- before commencement. Do not invent a one-day tenancy for it.
UPDATE "Lease"
SET
  "cancelledAt" = COALESCE("cancelledAt", "updatedAt"),
  "cancellationReason" = COALESCE("cancellationReason", 'Migrace V21.3: historicky ukončená budoucí smlouva')
WHERE "status" = 'ENDED'
  AND "startDate" > "updatedAt"
  AND "cancelledAt" IS NULL;

-- Preserve the best historical end marker for genuinely commenced legacy ENDED records.
UPDATE "Lease"
SET "terminatedOn" = CASE
  WHEN "endDate" IS NOT NULL AND "endDate" <= "updatedAt" THEN "endDate"
  ELSE GREATEST("updatedAt", "startDate")
END
WHERE "status" = 'ENDED'
  AND "cancelledAt" IS NULL
  AND "terminatedOn" IS NULL;

-- V21.3.2: preserve impossible legacy intervals as cancelled history. PostgreSQL
-- rejects a daterange whose lower bound is after its upper bound.
UPDATE "Lease"
SET
  "cancelledAt" = COALESCE("cancelledAt", "updatedAt"),
  "cancellationReason" = COALESCE(
    "cancellationReason",
    'Migrace V21.3.2: neplatný historický interval (konec před začátkem)'
  )
WHERE "cancelledAt" IS NULL
  AND LEAST("endDate", "terminatedOn") IS NOT NULL
  AND LEAST("endDate", "terminatedOn")::date < "startDate"::date;

-- Prevent new non-cancelled records from creating impossible intervals.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Lease_end_not_before_start'
  ) THEN
    ALTER TABLE "Lease"
      ADD CONSTRAINT "Lease_end_not_before_start"
      CHECK ("cancelledAt" IS NOT NULL OR "endDate" IS NULL OR "endDate"::date >= "startDate"::date);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Lease_termination_not_before_start'
  ) THEN
    ALTER TABLE "Lease"
      ADD CONSTRAINT "Lease_termination_not_before_start"
      CHECK ("cancelledAt" IS NOT NULL OR "terminatedOn" IS NULL OR "terminatedOn"::date >= "startDate"::date);
  END IF;
END $$;

-- Refuse to guess if legacy data contains genuinely overlapping effective rental periods.
-- The exception contains sample record ids directly in the Render deploy log.
DO $$
DECLARE
  conflicts TEXT;
BEGIN
  SELECT string_agg(format('unit=%s leases=%s/%s', x."unitId", x."aId", x."bId"), ', ')
  INTO conflicts
  FROM (
    SELECT a."unitId", a."id" AS "aId", b."id" AS "bId"
    FROM "Lease" a
    JOIN "Lease" b
      ON a."unitId" = b."unitId"
     AND a."id" < b."id"
    WHERE a."cancelledAt" IS NULL
      AND b."cancelledAt" IS NULL
      AND daterange(a."startDate"::date, LEAST(a."endDate", a."terminatedOn")::date, '[]')
          && daterange(b."startDate"::date, LEAST(b."endDate", b."terminatedOn")::date, '[]')
    LIMIT 10
  ) x;

  IF conflicts IS NOT NULL THEN
    RAISE EXCEPTION 'V21.3 migration stopped: overlapping lease periods: %', conflicts;
  END IF;
END $$;

-- Historical VS values must never be recycled on the same receiving owner account.
-- Print sample account/VS pairs if legacy data violates the new invariant.
DO $$
DECLARE
  conflicts TEXT;
BEGIN
  SELECT string_agg(format('account=%s VS=%s count=%s', x."ownerBankAccountId", x."variableSymbol", x.cnt), ', ')
  INTO conflicts
  FROM (
    SELECT "ownerBankAccountId", "variableSymbol", COUNT(*) AS cnt
    FROM "Lease"
    WHERE "ownerBankAccountId" IS NOT NULL
    GROUP BY "ownerBankAccountId", "variableSymbol"
    HAVING COUNT(*) > 1
    LIMIT 10
  ) x;

  IF conflicts IS NOT NULL THEN
    RAISE EXCEPTION 'V21.3 migration stopped: duplicate historical variable symbols: %', conflicts;
  END IF;
END $$;

-- Keep the original per-unit protection and add the stronger owner-account protection.
CREATE UNIQUE INDEX IF NOT EXISTS "Lease_unitId_variableSymbol_key"
  ON "Lease"("unitId", "variableSymbol");
CREATE UNIQUE INDEX IF NOT EXISTS "Lease_ownerBankAccountId_variableSymbol_key"
  ON "Lease"("ownerBankAccountId", "variableSymbol");
CREATE INDEX IF NOT EXISTS "Lease_unitId_startDate_idx" ON "Lease"("unitId", "startDate");
CREATE INDEX IF NOT EXISTS "Lease_tenantId_startDate_idx" ON "Lease"("tenantId", "startDate");
DROP INDEX IF EXISTS "Lease_tenantId_idx";

CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Lease_unit_period_no_overlap'
  ) THEN
    ALTER TABLE "Lease"
      ADD CONSTRAINT "Lease_unit_period_no_overlap"
      EXCLUDE USING gist (
        "unitId" WITH =,
        (daterange("startDate"::date, LEAST("endDate", "terminatedOn")::date, '[]')) WITH &&
      )
      WHERE ("cancelledAt" IS NULL);
  END IF;
END $$;

-- Synchronize legacy status caches once during migration.
UPDATE "Lease"
SET "status" = CASE
  WHEN "cancelledAt" IS NOT NULL THEN 'ENDED'::"LeaseStatus"
  WHEN "startDate"::date > (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Prague')::date THEN 'FUTURE'::"LeaseStatus"
  WHEN LEAST("endDate", "terminatedOn") IS NOT NULL
       AND LEAST("endDate", "terminatedOn")::date < (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Prague')::date THEN 'ENDED'::"LeaseStatus"
  ELSE 'ACTIVE'::"LeaseStatus"
END;

UPDATE "Unit" u
SET "status" = CASE
  WHEN u."operationalStatus" = 'RENOVATION' THEN 'RENOVATION'::"UnitStatus"
  WHEN u."operationalStatus" = 'INACTIVE' THEN 'INACTIVE'::"UnitStatus"
  WHEN EXISTS (
    SELECT 1
    FROM "Lease" l
    WHERE l."unitId" = u."id"
      AND l."cancelledAt" IS NULL
      AND l."startDate"::date <= (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Prague')::date
      AND (LEAST(l."endDate", l."terminatedOn") IS NULL OR LEAST(l."endDate", l."terminatedOn")::date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Prague')::date)
  ) THEN 'OCCUPIED'::"UnitStatus"
  ELSE 'VACANT'::"UnitStatus"
END;
