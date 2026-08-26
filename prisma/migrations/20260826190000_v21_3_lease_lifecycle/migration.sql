-- FlatCloud V21.3 – lease lifecycle is derived from contract dates.
-- Legacy Lease.status and Unit.status remain as compatibility caches for a safe rolling deploy.

CREATE TYPE "UnitOperationalStatus" AS ENUM ('STANDARD', 'RENOVATION', 'INACTIVE');

ALTER TABLE "Unit"
  ADD COLUMN "operationalStatus" "UnitOperationalStatus" NOT NULL DEFAULT 'STANDARD';

UPDATE "Unit"
SET "operationalStatus" = CASE
  WHEN "status" = 'RENOVATION' THEN 'RENOVATION'::"UnitOperationalStatus"
  WHEN "status" = 'INACTIVE' THEN 'INACTIVE'::"UnitOperationalStatus"
  ELSE 'STANDARD'::"UnitOperationalStatus"
END;

ALTER TABLE "Lease"
  ADD COLUMN "terminatedOn" TIMESTAMP(3),
  ADD COLUMN "terminationReason" TEXT,
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancellationReason" TEXT;

-- Preserve the best historical end marker for records that were manually marked ENDED.
UPDATE "Lease"
SET "terminatedOn" = LEAST("endDate", GREATEST("updatedAt", "startDate"))
WHERE "status" = 'ENDED' AND "terminatedOn" IS NULL;

-- Tenant.active is retained only as a legacy person-record flag; rental lifecycle no longer depends on it.

-- Refuse to guess if legacy data already contains overlapping rental periods.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Lease" a
    JOIN "Lease" b
      ON a."unitId" = b."unitId"
     AND a."id" < b."id"
    WHERE a."cancelledAt" IS NULL
      AND b."cancelledAt" IS NULL
      AND daterange(a."startDate"::date, LEAST(a."endDate", a."terminatedOn")::date, '[]')
          && daterange(b."startDate"::date, LEAST(b."endDate", b."terminatedOn")::date, '[]')
  ) THEN
    RAISE EXCEPTION 'V21.3 migration stopped: existing Lease rows overlap on at least one unit. Resolve the conflicting historical contracts before deploying V21.3.';
  END IF;
END $$;

-- Historical VS values must never be recycled on the same receiving owner account.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Lease"
    WHERE "ownerBankAccountId" IS NOT NULL
    GROUP BY "ownerBankAccountId", "variableSymbol"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'V21.3 migration stopped: duplicate historical variable symbols exist on the same owner bank account.';
  END IF;
END $$;

DROP INDEX IF EXISTS "Lease_unitId_variableSymbol_key";
CREATE UNIQUE INDEX "Lease_ownerBankAccountId_variableSymbol_key"
  ON "Lease"("ownerBankAccountId", "variableSymbol");
CREATE INDEX "Lease_unitId_startDate_idx" ON "Lease"("unitId", "startDate");
CREATE INDEX "Lease_tenantId_startDate_idx" ON "Lease"("tenantId", "startDate");
DROP INDEX IF EXISTS "Lease_tenantId_idx";

CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "Lease"
  ADD CONSTRAINT "Lease_unit_period_no_overlap"
  EXCLUDE USING gist (
    "unitId" WITH =,
    (daterange("startDate"::date, LEAST("endDate", "terminatedOn")::date, '[]')) WITH &&
  )
  WHERE ("cancelledAt" IS NULL);

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
SET "status" = CASE WHEN EXISTS (
  SELECT 1
  FROM "Lease" l
  WHERE l."unitId" = u."id"
    AND l."cancelledAt" IS NULL
    AND l."startDate"::date <= (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Prague')::date
    AND (LEAST(l."endDate", l."terminatedOn") IS NULL OR LEAST(l."endDate", l."terminatedOn")::date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Prague')::date)
) THEN 'OCCUPIED'::"UnitStatus" ELSE 'VACANT'::"UnitStatus" END;
