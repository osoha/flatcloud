CREATE TYPE "RentTiming" AS ENUM ('ADVANCE', 'ARREARS');
CREATE TYPE "PropertyOwnershipMode" AS ENUM ('WHOLE_OBJECT', 'UNIT_BASED', 'SVJ');

ALTER TABLE "User"
  ADD COLUMN "allProperties" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "title" TEXT;

ALTER TABLE "Property"
  ADD COLUMN "ownershipMode" "PropertyOwnershipMode" NOT NULL DEFAULT 'WHOLE_OBJECT',
  ADD COLUMN "communicationOwnerId" TEXT,
  ADD COLUMN "managerId" TEXT;

ALTER TABLE "Property"
  ADD CONSTRAINT "Property_communicationOwnerId_fkey" FOREIGN KEY ("communicationOwnerId") REFERENCES "Owner"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Property_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Property_communicationOwnerId_idx" ON "Property"("communicationOwnerId");
CREATE INDEX "Property_managerId_idx" ON "Property"("managerId");

ALTER TABLE "Lease" ADD COLUMN "rentTiming" "RentTiming" NOT NULL DEFAULT 'ADVANCE';
ALTER TABLE "Charge" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "UserInvitation"
  ADD COLUMN "propertyIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "allProperties" BOOLEAN NOT NULL DEFAULT false;
UPDATE "UserInvitation" SET "propertyIds" = ARRAY["propertyId"] WHERE cardinality("propertyIds") = 0;
