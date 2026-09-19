-- R26C2: domovní a podružná měřidla, hierarchie a auditovatelná výměna.
CREATE TYPE "MeterScope" AS ENUM ('UNIT', 'HOUSE_MAIN', 'HOUSE_SUBMETER');

ALTER TABLE "Meter"
  ADD COLUMN "propertyId" TEXT,
  ADD COLUMN "scope" "MeterScope" NOT NULL DEFAULT 'UNIT',
  ADD COLUMN "parentId" TEXT,
  ADD COLUMN "replacementOfId" TEXT,
  ADD COLUMN "location" TEXT,
  ADD COLUMN "installedAt" TIMESTAMP(3),
  ADD COLUMN "removedAt" TIMESTAMP(3);

UPDATE "Meter" m
SET "propertyId" = u."propertyId"
FROM "Unit" u
WHERE u.id = m."unitId";

ALTER TABLE "Meter"
  ALTER COLUMN "propertyId" SET NOT NULL,
  ALTER COLUMN "unitId" DROP NOT NULL;

CREATE UNIQUE INDEX "Meter_replacementOfId_key" ON "Meter"("replacementOfId");
CREATE INDEX "Meter_propertyId_scope_type_idx" ON "Meter"("propertyId", "scope", "type");
CREATE INDEX "Meter_parentId_idx" ON "Meter"("parentId");

ALTER TABLE "Meter"
  ADD CONSTRAINT "Meter_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "Meter_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Meter"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Meter_replacementOfId_fkey" FOREIGN KEY ("replacementOfId") REFERENCES "Meter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
