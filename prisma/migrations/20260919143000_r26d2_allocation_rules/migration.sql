CREATE TYPE "SettlementAllocationMethod" AS ENUM ('METER_CONSUMPTION','AREA','PERSON_DAYS','EXTERNAL_RESULT','MANUAL');

CREATE TABLE "SettlementAllocationRule" (
  "id" TEXT NOT NULL, "propertyId" TEXT NOT NULL, "service" TEXT NOT NULL,
  "method" "SettlementAllocationMethod" NOT NULL, "validFrom" TIMESTAMP(3) NOT NULL,
  "validTo" TIMESTAMP(3), "meterType" "MeterType", "note" TEXT, "active" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SettlementAllocationRule_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "LeaseOccupancyPeriod" (
  "id" TEXT NOT NULL, "leaseId" TEXT NOT NULL, "validFrom" TIMESTAMP(3) NOT NULL,
  "validTo" TIMESTAMP(3), "personCount" INTEGER NOT NULL, "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeaseOccupancyPeriod_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LeaseOccupancyPeriod_personCount_check" CHECK ("personCount" >= 0)
);
CREATE TABLE "UnitAreaPeriod" (
  "id" TEXT NOT NULL, "unitId" TEXT NOT NULL, "validFrom" TIMESTAMP(3) NOT NULL,
  "validTo" TIMESTAMP(3), "areaM2" DOUBLE PRECISION NOT NULL, "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UnitAreaPeriod_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UnitAreaPeriod_area_check" CHECK ("areaM2" > 0)
);
CREATE INDEX "SettlementAllocationRule_propertyId_service_validFrom_idx" ON "SettlementAllocationRule"("propertyId","service","validFrom");
CREATE INDEX "LeaseOccupancyPeriod_leaseId_validFrom_idx" ON "LeaseOccupancyPeriod"("leaseId","validFrom");
CREATE INDEX "UnitAreaPeriod_unitId_validFrom_idx" ON "UnitAreaPeriod"("unitId","validFrom");
ALTER TABLE "SettlementAllocationRule" ADD CONSTRAINT "SettlementAllocationRule_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SettlementAllocationRule" ADD CONSTRAINT "SettlementAllocationRule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LeaseOccupancyPeriod" ADD CONSTRAINT "LeaseOccupancyPeriod_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UnitAreaPeriod" ADD CONSTRAINT "UnitAreaPeriod_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
