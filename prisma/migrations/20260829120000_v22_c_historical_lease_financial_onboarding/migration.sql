ALTER TYPE "LeaseCreditType" ADD VALUE 'OPENING_BALANCE';

ALTER TABLE "Lease" ADD COLUMN "financialTrackingFromPeriod" TEXT;

UPDATE "Lease"
SET "financialTrackingFromPeriod" = to_char("startDate" AT TIME ZONE 'UTC', 'YYYY-MM');

ALTER TABLE "Lease" ALTER COLUMN "financialTrackingFromPeriod" SET NOT NULL;
