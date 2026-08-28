-- CreateEnum
CREATE TYPE "UnitOperationalStatusEventSource" AS ENUM ('SYSTEM_BASELINE', 'USER_CHANGE', 'MANUAL_BASELINE');

-- CreateEnum
CREATE TYPE "ReportingGroupPermission" AS ENUM ('VIEW', 'EDIT', 'ADMIN');

-- CreateEnum
CREATE TYPE "QuarterSnapshotSource" AS ENUM ('CALCULATED', 'MANUAL_BASELINE');

-- CreateEnum
CREATE TYPE "QuarterlyReportStatus" AS ENUM ('DRAFT', 'REVIEW', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "PropertyReportingStatus" AS ENUM ('STABILIZED', 'RENOVATION', 'DEVELOPMENT', 'EXIT');

-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('CONTRACT', 'CONTRACT_ADDENDUM', 'HANDOVER_PROTOCOL', 'INSPECTION_PROTOCOL', 'PHOTO', 'TECHNICAL_DOCUMENT', 'INVOICE', 'OFFER', 'ENERGY_CERTIFICATE', 'INSURANCE', 'LEGAL', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentPhotoStage" AS ENUM ('BEFORE', 'AFTER', 'GENERAL');

-- AlterTable
ALTER TABLE "LeaseCreditApplication" ADD COLUMN "effectiveAt" TIMESTAMP(3);
UPDATE "LeaseCreditApplication" SET "effectiveAt" = "createdAt" WHERE "effectiveAt" IS NULL;
ALTER TABLE "LeaseCreditApplication" ALTER COLUMN "effectiveAt" SET NOT NULL;

-- CreateTable
CREATE TABLE "UnitOperationalStatusEvent" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "status" "UnitOperationalStatus" NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "source" "UnitOperationalStatusEventSource" NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnitOperationalStatusEvent_pkey" PRIMARY KEY ("id")
);

-- Rollout baseline: deliberately records only the status known at migration time.
-- It does not fabricate history back to Unit.createdAt.
INSERT INTO "UnitOperationalStatusEvent" ("id", "unitId", "status", "effectiveAt", "source", "createdAt")
SELECT 'v22baseline_' || md5("id"), "id", "operationalStatus", CURRENT_TIMESTAMP, 'SYSTEM_BASELINE', CURRENT_TIMESTAMP
FROM "Unit";

-- CreateTable
CREATE TABLE "ReportingGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportingGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportingGroupProperty" (
    "id" TEXT NOT NULL,
    "reportingGroupId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportingGroupProperty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportingGroupMember" (
    "reportingGroupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permission" "ReportingGroupPermission" NOT NULL DEFAULT 'VIEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportingGroupMember_pkey" PRIMARY KEY ("reportingGroupId","userId")
);

-- CreateTable
CREATE TABLE "QuarterSnapshot" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "asOfDate" TIMESTAMP(3) NOT NULL,
    "year" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "source" "QuarterSnapshotSource" NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "calculatorVersion" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "quality" JSONB NOT NULL,
    "sourceNote" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuarterSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuarterlyReport" (
    "id" TEXT NOT NULL,
    "reportingGroupId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "status" "QuarterlyReportStatus" NOT NULL DEFAULT 'DRAFT',
    "asOfDate" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuarterlyReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuarterlyPropertyReport" (
    "id" TEXT NOT NULL,
    "quarterlyReportId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "propertyStatus" "PropertyReportingStatus",
    "managementCommentary" TEXT,
    "technicalSections" JSONB,
    "valuationRows" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuarterlyPropertyReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileAsset" (
    "id" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "previewStorageKey" TEXT,
    "thumbnailStorageKey" TEXT,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FileAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "fileAssetId" TEXT NOT NULL,
    "category" "DocumentCategory" NOT NULL,
    "photoStage" "DocumentPhotoStage",
    "title" TEXT NOT NULL,
    "description" TEXT,
    "documentDate" TIMESTAMP(3),
    "unitId" TEXT,
    "leaseId" TEXT,
    "taskId" TEXT,
    "taskEntryId" TEXT,
    "complianceRecordId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UnitOperationalStatusEvent_unitId_effectiveAt_idx" ON "UnitOperationalStatusEvent"("unitId", "effectiveAt");

-- CreateIndex
CREATE INDEX "ReportingGroupProperty_reportingGroupId_effectiveFrom_effec_idx" ON "ReportingGroupProperty"("reportingGroupId", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "ReportingGroupProperty_propertyId_idx" ON "ReportingGroupProperty"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportingGroupProperty_reportingGroupId_propertyId_effectiv_key" ON "ReportingGroupProperty"("reportingGroupId", "propertyId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "ReportingGroupMember_userId_permission_idx" ON "ReportingGroupMember"("userId", "permission");

-- CreateIndex
CREATE INDEX "QuarterSnapshot_propertyId_year_quarter_idx" ON "QuarterSnapshot"("propertyId", "year", "quarter");

-- CreateIndex
CREATE UNIQUE INDEX "QuarterSnapshot_propertyId_asOfDate_revision_key" ON "QuarterSnapshot"("propertyId", "asOfDate", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "QuarterlyReport_reportingGroupId_year_quarter_revision_key" ON "QuarterlyReport"("reportingGroupId", "year", "quarter", "revision");

-- CreateIndex
CREATE INDEX "QuarterlyPropertyReport_snapshotId_idx" ON "QuarterlyPropertyReport"("snapshotId");

-- CreateIndex
CREATE UNIQUE INDEX "QuarterlyPropertyReport_quarterlyReportId_propertyId_key" ON "QuarterlyPropertyReport"("quarterlyReportId", "propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "FileAsset_storageKey_key" ON "FileAsset"("storageKey");

-- CreateIndex
CREATE INDEX "FileAsset_sha256_idx" ON "FileAsset"("sha256");

-- CreateIndex
CREATE INDEX "Document_propertyId_deletedAt_idx" ON "Document"("propertyId", "deletedAt");

-- CreateIndex
CREATE INDEX "Document_fileAssetId_idx" ON "Document"("fileAssetId");

-- CreateIndex
CREATE INDEX "Document_unitId_idx" ON "Document"("unitId");

-- CreateIndex
CREATE INDEX "Document_leaseId_idx" ON "Document"("leaseId");

-- CreateIndex
CREATE INDEX "Document_taskId_idx" ON "Document"("taskId");

-- CreateIndex
CREATE INDEX "Document_taskEntryId_idx" ON "Document"("taskEntryId");

-- CreateIndex
CREATE INDEX "Document_complianceRecordId_idx" ON "Document"("complianceRecordId");

-- AddForeignKey
ALTER TABLE "UnitOperationalStatusEvent" ADD CONSTRAINT "UnitOperationalStatusEvent_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitOperationalStatusEvent" ADD CONSTRAINT "UnitOperationalStatusEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportingGroupProperty" ADD CONSTRAINT "ReportingGroupProperty_reportingGroupId_fkey" FOREIGN KEY ("reportingGroupId") REFERENCES "ReportingGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportingGroupProperty" ADD CONSTRAINT "ReportingGroupProperty_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportingGroupMember" ADD CONSTRAINT "ReportingGroupMember_reportingGroupId_fkey" FOREIGN KEY ("reportingGroupId") REFERENCES "ReportingGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportingGroupMember" ADD CONSTRAINT "ReportingGroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuarterSnapshot" ADD CONSTRAINT "QuarterSnapshot_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuarterSnapshot" ADD CONSTRAINT "QuarterSnapshot_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuarterlyReport" ADD CONSTRAINT "QuarterlyReport_reportingGroupId_fkey" FOREIGN KEY ("reportingGroupId") REFERENCES "ReportingGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuarterlyReport" ADD CONSTRAINT "QuarterlyReport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuarterlyReport" ADD CONSTRAINT "QuarterlyReport_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuarterlyReport" ADD CONSTRAINT "QuarterlyReport_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuarterlyPropertyReport" ADD CONSTRAINT "QuarterlyPropertyReport_quarterlyReportId_fkey" FOREIGN KEY ("quarterlyReportId") REFERENCES "QuarterlyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuarterlyPropertyReport" ADD CONSTRAINT "QuarterlyPropertyReport_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuarterlyPropertyReport" ADD CONSTRAINT "QuarterlyPropertyReport_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "QuarterSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_taskEntryId_fkey" FOREIGN KEY ("taskEntryId") REFERENCES "TaskEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_complianceRecordId_fkey" FOREIGN KEY ("complianceRecordId") REFERENCES "ComplianceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
