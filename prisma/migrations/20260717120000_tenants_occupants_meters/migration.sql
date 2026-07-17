-- FlatCloud Rent V15: rozšířené kontakty nájemníků, osoby v bytě a měřidla.
CREATE TYPE "MeterType" AS ENUM ('COLD_WATER', 'HOT_WATER', 'ELECTRICITY_HIGH_TARIFF', 'ELECTRICITY_LOW_TARIFF', 'GAS');

ALTER TABLE "Tenant"
  ADD COLUMN "ico" TEXT,
  ADD COLUMN "permanentAddress" TEXT,
  ADD COLUMN "correspondenceAddress" TEXT,
  ADD COLUMN "billingAddress" TEXT,
  ADD COLUMN "billingEmail" TEXT,
  ADD COLUMN "communicationEmail" TEXT;

-- Zachování dosavadních dat při přechodu na podrobnější kontaktní pole.
UPDATE "Tenant"
SET "permanentAddress" = "address",
    "communicationEmail" = "email"
WHERE "type" = 'PERSON';

UPDATE "Tenant"
SET "billingAddress" = "address",
    "billingEmail" = "email",
    "communicationEmail" = "email"
WHERE "type" = 'COMPANY';

CREATE TABLE "Occupant" (
  "id" TEXT NOT NULL,
  "leaseId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "permanentAddress" TEXT,
  "correspondenceAddress" TEXT,
  "note" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Occupant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Meter" (
  "id" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "type" "MeterType" NOT NULL,
  "label" TEXT,
  "serialNumber" TEXT,
  "unitOfMeasure" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Meter_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MeterReading" (
  "id" TEXT NOT NULL,
  "meterId" TEXT NOT NULL,
  "leaseId" TEXT,
  "readAt" TIMESTAMP(3) NOT NULL,
  "value" DOUBLE PRECISION NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MeterReading_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Lease_variableSymbol_idx" ON "Lease"("variableSymbol");
CREATE INDEX "Occupant_leaseId_active_idx" ON "Occupant"("leaseId", "active");
CREATE INDEX "Meter_unitId_type_idx" ON "Meter"("unitId", "type");
CREATE INDEX "MeterReading_meterId_readAt_idx" ON "MeterReading"("meterId", "readAt");
CREATE INDEX "MeterReading_leaseId_idx" ON "MeterReading"("leaseId");

ALTER TABLE "Occupant" ADD CONSTRAINT "Occupant_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Meter" ADD CONSTRAINT "Meter_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeterReading" ADD CONSTRAINT "MeterReading_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "Meter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeterReading" ADD CONSTRAINT "MeterReading_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE SET NULL ON UPDATE CASCADE;
