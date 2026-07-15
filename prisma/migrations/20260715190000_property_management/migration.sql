-- Rozšíření produkční evidence nemovitostí, nájemníků, smluv a předpisů.
CREATE TYPE "OwnerType" AS ENUM ('COMPANY', 'PERSON', 'SPV');
CREATE TYPE "UnitType" AS ENUM ('APARTMENT', 'COMMERCIAL', 'GARAGE', 'PARKING', 'STORAGE', 'OTHER');
CREATE TYPE "UnitStatus" AS ENUM ('VACANT', 'OCCUPIED', 'RENOVATION', 'INACTIVE');
CREATE TYPE "TenantType" AS ENUM ('PERSON', 'COMPANY');
CREATE TYPE "ChargeCategory" AS ENUM ('RENT', 'WATER', 'HEATING', 'ELECTRICITY', 'SERVICES', 'PARKING', 'DEPOSIT', 'OTHER', 'ADJUSTMENT');

ALTER TABLE "Owner"
  ADD COLUMN "type" "OwnerType" NOT NULL DEFAULT 'COMPANY',
  ADD COLUMN "email" TEXT,
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "address" TEXT,
  ADD COLUMN "note" TEXT,
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Property"
  ADD COLUMN "postalCode" TEXT,
  ADD COLUMN "note" TEXT,
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Unit"
  ADD COLUMN "type" "UnitType" NOT NULL DEFAULT 'APARTMENT',
  ADD COLUMN "status" "UnitStatus" NOT NULL DEFAULT 'VACANT',
  ADD COLUMN "areaM2" DOUBLE PRECISION,
  ADD COLUMN "note" TEXT,
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Tenant"
  ADD COLUMN "type" "TenantType" NOT NULL DEFAULT 'PERSON',
  ADD COLUMN "address" TEXT,
  ADD COLUMN "note" TEXT,
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Lease"
  ADD COLUMN "contractNumber" TEXT,
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'CZK',
  ADD COLUMN "note" TEXT,
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Charge"
  ADD COLUMN "note" TEXT,
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "LeasePaymentItem" (
  "id" TEXT NOT NULL,
  "leaseId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" "ChargeCategory" NOT NULL DEFAULT 'OTHER',
  "amountCents" INTEGER NOT NULL,
  "validFrom" TIMESTAMP(3) NOT NULL,
  "validTo" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LeasePaymentItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChargeItem" (
  "id" TEXT NOT NULL,
  "chargeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" "ChargeCategory" NOT NULL DEFAULT 'OTHER',
  "amountCents" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChargeItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LeasePaymentItem_leaseId_validFrom_idx" ON "LeasePaymentItem"("leaseId", "validFrom");
CREATE INDEX "ChargeItem_chargeId_idx" ON "ChargeItem"("chargeId");

ALTER TABLE "LeasePaymentItem" ADD CONSTRAINT "LeasePaymentItem_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChargeItem" ADD CONSTRAINT "ChargeItem_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "Charge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Převedení stávajícího nájemného a služeb na verzované položky předpisu.
INSERT INTO "LeasePaymentItem" ("id", "leaseId", "name", "category", "amountCents", "validFrom", "active", "sortOrder", "createdAt", "updatedAt")
SELECT 'rent_' || "id", "id", 'Nájemné', 'RENT', "rentCents", "startDate", true, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Lease"
WHERE "rentCents" <> 0;

INSERT INTO "LeasePaymentItem" ("id", "leaseId", "name", "category", "amountCents", "validFrom", "active", "sortOrder", "createdAt", "updatedAt")
SELECT 'services_' || "id", "id", 'Zálohy na služby', 'SERVICES', "servicesCents", "startDate", true, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Lease"
WHERE "servicesCents" <> 0;

-- Stávající měsíční předpisy dostanou alespoň souhrnnou položku.
INSERT INTO "ChargeItem" ("id", "chargeId", "name", "category", "amountCents", "createdAt")
SELECT 'legacy_' || "id", "id", 'Měsíční předpis', 'OTHER', "amountCents", CURRENT_TIMESTAMP
FROM "Charge";

UPDATE "Unit" SET "status" = 'OCCUPIED'
WHERE EXISTS (SELECT 1 FROM "Lease" WHERE "Lease"."unitId" = "Unit"."id" AND "Lease"."status" = 'ACTIVE');
