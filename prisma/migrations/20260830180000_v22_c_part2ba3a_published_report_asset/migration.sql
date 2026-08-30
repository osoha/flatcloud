-- Published report revisions retain their canonical immutable internal asset.
ALTER TABLE "QuarterlyReport" ADD COLUMN "publishedAssetId" TEXT;

CREATE INDEX "QuarterlyReport_publishedAssetId_idx" ON "QuarterlyReport"("publishedAssetId");

ALTER TABLE "QuarterlyReport"
ADD CONSTRAINT "QuarterlyReport_publishedAssetId_fkey"
FOREIGN KEY ("publishedAssetId") REFERENCES "FileAsset"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
