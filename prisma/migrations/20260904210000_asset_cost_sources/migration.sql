-- AlterTable
ALTER TABLE "PropertyCost" ADD COLUMN "unitId" TEXT;
ALTER TABLE "PropertyCost" ADD COLUMN "documentNumber" TEXT;
ALTER TABLE "Document" ADD COLUMN "propertyCostId" TEXT;

-- CreateIndex
CREATE INDEX "PropertyCost_unitId_idx" ON "PropertyCost"("unitId");

-- CreateIndex
CREATE INDEX "Document_propertyCostId_idx" ON "Document"("propertyCostId");

-- AddForeignKey
ALTER TABLE "PropertyCost" ADD CONSTRAINT "PropertyCost_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_propertyCostId_fkey" FOREIGN KEY ("propertyCostId") REFERENCES "PropertyCost"("id") ON DELETE SET NULL ON UPDATE CASCADE;
