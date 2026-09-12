-- UX-REMODEL-R2B is additive. Existing owners remain explicitly unclassified and
-- existing properties are not included in FlatCloud financial consolidation.
CREATE TYPE "OwnerAffiliation" AS ENUM (
  'UNCLASSIFIED',
  'FLATCLOUD_PARENT',
  'FLATCLOUD_GROUP',
  'EXTERNAL'
);

CREATE TYPE "PropertyManagementScope" AS ENUM (
  'FULL_MANAGEMENT',
  'LIMITED_MANAGEMENT',
  'MONITORING_ONLY'
);

ALTER TABLE "Owner"
  ADD COLUMN "affiliation" "OwnerAffiliation" NOT NULL DEFAULT 'UNCLASSIFIED';

ALTER TABLE "Property"
  ADD COLUMN "managementScope" "PropertyManagementScope" NOT NULL DEFAULT 'FULL_MANAGEMENT',
  ADD COLUMN "flatcloudConsolidationBasisPoints" INTEGER;

ALTER TABLE "Property"
  ADD CONSTRAINT "Property_flatcloudConsolidationBasisPoints_check"
  CHECK (
    "flatcloudConsolidationBasisPoints" IS NULL
    OR "flatcloudConsolidationBasisPoints" BETWEEN 0 AND 10000
  );

CREATE INDEX "Owner_affiliation_idx" ON "Owner"("affiliation");
CREATE INDEX "Property_managementScope_idx" ON "Property"("managementScope");
CREATE INDEX "Property_flatcloudConsolidationBasisPoints_idx" ON "Property"("flatcloudConsolidationBasisPoints");
