ALTER TABLE "Task" ADD COLUMN "tenantPortalRequest" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "Task_tenantId_tenantPortalRequest_createdAt_idx" ON "Task"("tenantId", "tenantPortalRequest", "createdAt");
