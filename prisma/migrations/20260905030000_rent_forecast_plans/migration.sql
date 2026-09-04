-- CreateEnum
CREATE TYPE "RentForecastPlanStatus" AS ENUM ('DRAFT', 'APPROVED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "RentForecastPlan" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "status" "RentForecastPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "asOfDate" TIMESTAMP(3) NOT NULL,
    "horizonMonths" INTEGER NOT NULL,
    "annualGrowthBps" INTEGER NOT NULL,
    "vacancyBps" INTEGER NOT NULL,
    "collectionBps" INTEGER NOT NULL,
    "marketGapCaptureBps" INTEGER NOT NULL,
    "inputSnapshot" JSONB NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RentForecastPlan_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RentForecastPlan_revision_check" CHECK ("revision" > 0),
    CONSTRAINT "RentForecastPlan_horizonMonths_check" CHECK ("horizonMonths" IN (12, 24, 36)),
    CONSTRAINT "RentForecastPlan_annualGrowthBps_check" CHECK ("annualGrowthBps" BETWEEN 0 AND 2000),
    CONSTRAINT "RentForecastPlan_vacancyBps_check" CHECK ("vacancyBps" BETWEEN 0 AND 10000),
    CONSTRAINT "RentForecastPlan_collectionBps_check" CHECK ("collectionBps" BETWEEN 0 AND 10000),
    CONSTRAINT "RentForecastPlan_marketGapCaptureBps_check" CHECK ("marketGapCaptureBps" BETWEEN 0 AND 10000),
    CONSTRAINT "RentForecastPlan_approval_check" CHECK (
        ("status" = 'APPROVED' AND "approvedById" IS NOT NULL AND "approvedAt" IS NOT NULL)
        OR ("status" <> 'APPROVED' AND "approvedById" IS NULL AND "approvedAt" IS NULL)
    )
);

-- CreateTable
CREATE TABLE "RentForecastPlanProperty" (
    "planId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,

    CONSTRAINT "RentForecastPlanProperty_pkey" PRIMARY KEY ("planId", "propertyId")
);

-- CreateIndex
CREATE UNIQUE INDEX "RentForecastPlan_seriesId_revision_key" ON "RentForecastPlan"("seriesId", "revision");
CREATE INDEX "RentForecastPlan_status_updatedAt_idx" ON "RentForecastPlan"("status", "updatedAt");
CREATE INDEX "RentForecastPlan_createdById_updatedAt_idx" ON "RentForecastPlan"("createdById", "updatedAt");
CREATE INDEX "RentForecastPlanProperty_propertyId_idx" ON "RentForecastPlanProperty"("propertyId");

-- AddForeignKey
ALTER TABLE "RentForecastPlan" ADD CONSTRAINT "RentForecastPlan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentForecastPlan" ADD CONSTRAINT "RentForecastPlan_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentForecastPlanProperty" ADD CONSTRAINT "RentForecastPlanProperty_planId_fkey" FOREIGN KEY ("planId") REFERENCES "RentForecastPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RentForecastPlanProperty" ADD CONSTRAINT "RentForecastPlanProperty_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
