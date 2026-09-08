ALTER TABLE "PropertyCost" ADD COLUMN "taskId" TEXT;
CREATE INDEX "PropertyCost_taskId_idx" ON "PropertyCost"("taskId");
ALTER TABLE "PropertyCost" ADD CONSTRAINT "PropertyCost_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
