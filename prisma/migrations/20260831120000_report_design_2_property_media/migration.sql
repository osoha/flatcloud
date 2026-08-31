-- CreateEnum
CREATE TYPE "QuarterlyReportMediaRole" AS ENUM ('PRIMARY', 'SECONDARY');

-- CreateTable
CREATE TABLE "QuarterlyPropertyReportMedia" (
    "id" TEXT NOT NULL,
    "quarterlyPropertyReportId" TEXT NOT NULL,
    "role" "QuarterlyReportMediaRole" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "fileAssetId" TEXT NOT NULL,
    "sourceDocumentId" TEXT,
    "caption" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuarterlyPropertyReportMedia_pkey" PRIMARY KEY ("id")
);

-- One primary photograph per property report; secondary rows remain extensible.
CREATE UNIQUE INDEX "QuarterlyPropertyReportMedia_primary_key"
ON "QuarterlyPropertyReportMedia"("quarterlyPropertyReportId", "role")
WHERE "role" = 'PRIMARY';

CREATE INDEX "QuarterlyPropertyReportMedia_quarterlyPropertyReportId_role_sortOrder_idx" ON "QuarterlyPropertyReportMedia"("quarterlyPropertyReportId", "role", "sortOrder");
CREATE INDEX "QuarterlyPropertyReportMedia_fileAssetId_idx" ON "QuarterlyPropertyReportMedia"("fileAssetId");
CREATE INDEX "QuarterlyPropertyReportMedia_sourceDocumentId_idx" ON "QuarterlyPropertyReportMedia"("sourceDocumentId");
CREATE INDEX "QuarterlyPropertyReportMedia_createdById_idx" ON "QuarterlyPropertyReportMedia"("createdById");

ALTER TABLE "QuarterlyPropertyReportMedia" ADD CONSTRAINT "QuarterlyPropertyReportMedia_quarterlyPropertyReportId_fkey" FOREIGN KEY ("quarterlyPropertyReportId") REFERENCES "QuarterlyPropertyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuarterlyPropertyReportMedia" ADD CONSTRAINT "QuarterlyPropertyReportMedia_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuarterlyPropertyReportMedia" ADD CONSTRAINT "QuarterlyPropertyReportMedia_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QuarterlyPropertyReportMedia" ADD CONSTRAINT "QuarterlyPropertyReportMedia_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
