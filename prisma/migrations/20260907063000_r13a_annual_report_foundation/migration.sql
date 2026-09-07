CREATE TYPE "AnnualReportStatus" AS ENUM ('DRAFT', 'REVIEW', 'PUBLISHED');

ALTER TYPE "ReportDesignTemplateType" ADD VALUE 'ANNUAL_PORTFOLIO';

CREATE TABLE "AnnualReport" (
    "id" TEXT NOT NULL,
    "reportingGroupId" TEXT NOT NULL,
    "reportingGroupNameSnapshot" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "status" "AnnualReportStatus" NOT NULL DEFAULT 'DRAFT',
    "asOfDate" TIMESTAMP(3) NOT NULL,
    "founderLetter" TEXT,
    "executiveSummary" TEXT,
    "investmentThesis" TEXT,
    "valueCreationSummary" TEXT,
    "outlook" TEXT,
    "grossAssetValueCents" BIGINT,
    "netAssetValueCents" BIGINT,
    "debtCents" BIGINT,
    "targetPortfolioValueCents" BIGINT,
    "realizedExitProceedsCents" BIGINT,
    "plannedExitProceedsCents" BIGINT,
    "issuedShares" INTEGER,
    "treasuryShares" INTEGER,
    "sharePriceCents" BIGINT,
    "createdById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "publishedAssetId" TEXT,
    "designTemplateVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AnnualReport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AnnualPropertyReport" (
    "id" TEXT NOT NULL,
    "annualReportId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "propertyNameSnapshot" TEXT NOT NULL,
    "propertyAddressSnapshot" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "openingValueCents" BIGINT,
    "currentValueCents" BIGINT,
    "targetValueCents" BIGINT,
    "realizedExitProceedsCents" BIGINT,
    "plannedExitProceedsCents" BIGINT,
    "plannedExitYear" INTEGER,
    "investmentCase" TEXT,
    "valueCreationNarrative" TEXT,
    "outlook" TEXT,
    "sourceNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AnnualPropertyReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AnnualReport_reportingGroupId_year_revision_key" ON "AnnualReport"("reportingGroupId", "year", "revision");
CREATE INDEX "AnnualReport_publishedAssetId_idx" ON "AnnualReport"("publishedAssetId");
CREATE INDEX "AnnualReport_designTemplateVersionId_idx" ON "AnnualReport"("designTemplateVersionId");
CREATE UNIQUE INDEX "AnnualPropertyReport_annualReportId_propertyId_key" ON "AnnualPropertyReport"("annualReportId", "propertyId");
CREATE INDEX "AnnualPropertyReport_snapshotId_idx" ON "AnnualPropertyReport"("snapshotId");

ALTER TABLE "AnnualReport" ADD CONSTRAINT "AnnualReport_reportingGroupId_fkey" FOREIGN KEY ("reportingGroupId") REFERENCES "ReportingGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AnnualReport" ADD CONSTRAINT "AnnualReport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AnnualReport" ADD CONSTRAINT "AnnualReport_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AnnualReport" ADD CONSTRAINT "AnnualReport_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AnnualReport" ADD CONSTRAINT "AnnualReport_publishedAssetId_fkey" FOREIGN KEY ("publishedAssetId") REFERENCES "FileAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AnnualReport" ADD CONSTRAINT "AnnualReport_designTemplateVersionId_fkey" FOREIGN KEY ("designTemplateVersionId") REFERENCES "ReportDesignTemplateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AnnualPropertyReport" ADD CONSTRAINT "AnnualPropertyReport_annualReportId_fkey" FOREIGN KEY ("annualReportId") REFERENCES "AnnualReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnnualPropertyReport" ADD CONSTRAINT "AnnualPropertyReport_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AnnualPropertyReport" ADD CONSTRAINT "AnnualPropertyReport_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "QuarterSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
