-- CreateEnum
CREATE TYPE "PropertyCostKind" AS ENUM ('OPEX', 'CAPEX');

-- CreateEnum
CREATE TYPE "PropertyCostStatus" AS ENUM ('PLANNED', 'COMMITTED', 'ACTUAL');

-- CreateEnum
CREATE TYPE "PropertyCostCategory" AS ENUM ('REPAIRS', 'MAINTENANCE', 'UTILITIES', 'INSURANCE', 'TAX', 'MANAGEMENT', 'LEGAL', 'CONSTRUCTION', 'EQUIPMENT', 'FINANCING', 'OTHER');

-- CreateEnum
CREATE TYPE "LoanRateType" AS ENUM ('FIXED', 'FLOATING');

-- CreateTable
CREATE TABLE "PropertyCost" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "kind" "PropertyCostKind" NOT NULL,
    "status" "PropertyCostStatus" NOT NULL DEFAULT 'PLANNED',
    "category" "PropertyCostCategory" NOT NULL DEFAULT 'OTHER',
    "title" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "vendor" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertyCost_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PropertyCost_amountCents_check" CHECK ("amountCents" > 0)
);

-- CreateTable
CREATE TABLE "PropertyLoan" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "lender" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "principalCents" INTEGER NOT NULL,
    "outstandingPrincipalCents" INTEGER NOT NULL,
    "annualInterestRateBps" INTEGER NOT NULL,
    "rateType" "LoanRateType" NOT NULL DEFAULT 'FIXED',
    "fixedUntil" TIMESTAMP(3),
    "maturityDate" TIMESTAMP(3),
    "monthlyDebtServiceCents" INTEGER,
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertyLoan_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PropertyLoan_principalCents_check" CHECK ("principalCents" > 0),
    CONSTRAINT "PropertyLoan_outstandingPrincipalCents_check" CHECK ("outstandingPrincipalCents" >= 0),
    CONSTRAINT "PropertyLoan_annualInterestRateBps_check" CHECK ("annualInterestRateBps" BETWEEN 0 AND 10000),
    CONSTRAINT "PropertyLoan_monthlyDebtServiceCents_check" CHECK ("monthlyDebtServiceCents" IS NULL OR "monthlyDebtServiceCents" >= 0)
);

-- CreateIndex
CREATE INDEX "PropertyCost_propertyId_effectiveAt_idx" ON "PropertyCost"("propertyId", "effectiveAt");

-- CreateIndex
CREATE INDEX "PropertyCost_propertyId_kind_status_idx" ON "PropertyCost"("propertyId", "kind", "status");

-- CreateIndex
CREATE INDEX "PropertyLoan_propertyId_active_idx" ON "PropertyLoan"("propertyId", "active");

-- CreateIndex
CREATE INDEX "PropertyLoan_fixedUntil_idx" ON "PropertyLoan"("fixedUntil");

-- CreateIndex
CREATE INDEX "PropertyLoan_maturityDate_idx" ON "PropertyLoan"("maturityDate");

-- AddForeignKey
ALTER TABLE "PropertyCost" ADD CONSTRAINT "PropertyCost_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyLoan" ADD CONSTRAINT "PropertyLoan_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
