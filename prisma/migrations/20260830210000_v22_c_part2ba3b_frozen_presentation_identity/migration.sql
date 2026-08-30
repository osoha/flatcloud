-- Freeze report presentation identity without changing reporting ownership relations.
ALTER TABLE "QuarterlyReport" ADD COLUMN "reportingGroupNameSnapshot" TEXT;
ALTER TABLE "QuarterlyPropertyReport" ADD COLUMN "propertyNameSnapshot" TEXT;
ALTER TABLE "QuarterlyPropertyReport" ADD COLUMN "propertyAddressSnapshot" TEXT;

UPDATE "QuarterlyReport" AS report
SET "reportingGroupNameSnapshot" = "ReportingGroup"."name"
FROM "ReportingGroup"
WHERE "ReportingGroup"."id" = report."reportingGroupId";

UPDATE "QuarterlyPropertyReport" AS report
SET
  "propertyNameSnapshot" = "Property"."name",
  "propertyAddressSnapshot" = concat_ws(', ',
    "Property"."address",
    NULLIF(concat_ws(' ', "Property"."postalCode", "Property"."city"), '')
  )
FROM "Property"
WHERE "Property"."id" = report."propertyId";

ALTER TABLE "QuarterlyReport" ALTER COLUMN "reportingGroupNameSnapshot" SET NOT NULL;
ALTER TABLE "QuarterlyPropertyReport" ALTER COLUMN "propertyNameSnapshot" SET NOT NULL;
ALTER TABLE "QuarterlyPropertyReport" ALTER COLUMN "propertyAddressSnapshot" SET NOT NULL;
