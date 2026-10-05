ALTER TABLE "TaskChecklistItem" ADD COLUMN "meterId" TEXT, ADD COLUMN "meterPeriodKey" TEXT, ADD COLUMN "baselineReadingId" TEXT, ADD COLUMN "requiredFrom" TIMESTAMP(3);
CREATE UNIQUE INDEX "TaskChecklistItem_taskId_meterId_meterPeriodKey_key" ON "TaskChecklistItem"("taskId", "meterId", "meterPeriodKey");
