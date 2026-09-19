CREATE TYPE "AnnualReviewStatus" AS ENUM ('DRAFT', 'READY_FOR_ACCOUNTANT', 'CONFIRMED_BY_ACCOUNTANT', 'EXCLUDED');

ALTER TABLE "PropertyCost"
  ADD COLUMN "annualReviewStatus" "AnnualReviewStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "annualReviewNote" TEXT,
  ADD COLUMN "annualReviewedById" TEXT,
  ADD COLUMN "annualReviewedAt" TIMESTAMP(3);

CREATE TABLE "OwnershipPeriod" (
  "id" TEXT NOT NULL,
  "scopeKey" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "unitId" TEXT,
  "ownerId" TEXT NOT NULL,
  "shareBasisPoints" INTEGER NOT NULL,
  "validFrom" TIMESTAMP(3) NOT NULL,
  "validTo" TIMESTAMP(3),
  "sourceNote" TEXT,
  "confirmedById" TEXT NOT NULL,
  "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OwnershipPeriod_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OwnershipPeriod_share_check" CHECK ("shareBasisPoints" BETWEEN 1 AND 10000),
  CONSTRAINT "OwnershipPeriod_dates_check" CHECK ("validTo" IS NULL OR "validTo" >= "validFrom"),
  CONSTRAINT "OwnershipPeriod_scope_check" CHECK (
    ("unitId" IS NULL AND "scopeKey" = 'property:' || "propertyId") OR
    ("unitId" IS NOT NULL AND "scopeKey" = 'unit:' || "unitId")
  )
);

CREATE TABLE "PropertyLoanAnnualEvidence" (
  "id" TEXT NOT NULL,
  "loanId" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "interestPaidCents" BIGINT NOT NULL,
  "documentId" TEXT,
  "reviewStatus" "AnnualReviewStatus" NOT NULL DEFAULT 'DRAFT',
  "note" TEXT,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PropertyLoanAnnualEvidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PropertyLoanAnnualEvidence_year_check" CHECK ("year" BETWEEN 2000 AND 2200),
  CONSTRAINT "PropertyLoanAnnualEvidence_interest_check" CHECK ("interestPaidCents" >= 0)
);

CREATE UNIQUE INDEX "OwnershipPeriod_scopeKey_ownerId_validFrom_key" ON "OwnershipPeriod"("scopeKey", "ownerId", "validFrom");
CREATE INDEX "OwnershipPeriod_propertyId_validFrom_validTo_idx" ON "OwnershipPeriod"("propertyId", "validFrom", "validTo");
CREATE INDEX "OwnershipPeriod_unitId_validFrom_validTo_idx" ON "OwnershipPeriod"("unitId", "validFrom", "validTo");
CREATE INDEX "OwnershipPeriod_ownerId_validFrom_validTo_idx" ON "OwnershipPeriod"("ownerId", "validFrom", "validTo");
CREATE UNIQUE INDEX "PropertyLoanAnnualEvidence_loanId_year_key" ON "PropertyLoanAnnualEvidence"("loanId", "year");
CREATE INDEX "PropertyLoanAnnualEvidence_year_reviewStatus_idx" ON "PropertyLoanAnnualEvidence"("year", "reviewStatus");
CREATE INDEX "PropertyLoanAnnualEvidence_documentId_idx" ON "PropertyLoanAnnualEvidence"("documentId");
CREATE INDEX "PropertyCost_annualReviewStatus_effectiveAt_idx" ON "PropertyCost"("annualReviewStatus", "effectiveAt");

ALTER TABLE "PropertyCost" ADD CONSTRAINT "PropertyCost_annualReviewedById_fkey" FOREIGN KEY ("annualReviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OwnershipPeriod" ADD CONSTRAINT "OwnershipPeriod_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OwnershipPeriod" ADD CONSTRAINT "OwnershipPeriod_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OwnershipPeriod" ADD CONSTRAINT "OwnershipPeriod_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OwnershipPeriod" ADD CONSTRAINT "OwnershipPeriod_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PropertyLoanAnnualEvidence" ADD CONSTRAINT "PropertyLoanAnnualEvidence_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "PropertyLoan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PropertyLoanAnnualEvidence" ADD CONSTRAINT "PropertyLoanAnnualEvidence_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PropertyLoanAnnualEvidence" ADD CONSTRAINT "PropertyLoanAnnualEvidence_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
