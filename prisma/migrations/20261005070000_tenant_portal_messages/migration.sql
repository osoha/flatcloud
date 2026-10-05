-- All existing tasks and staff announcements remain private by default.
ALTER TABLE "Task" ADD COLUMN "tenantPortalPublishedAt" TIMESTAMP(3), ADD COLUMN "tenantPortalTitle" TEXT, ADD COLUMN "tenantPortalBody" TEXT;
ALTER TABLE "TaskUserState" ADD COLUMN "tenantConfirmedAt" TIMESTAMP(3);
ALTER TYPE "AnnouncementAudienceKind" ADD VALUE 'TENANT_PROPERTY';
ALTER TYPE "AnnouncementAudienceKind" ADD VALUE 'TENANT_LEASE';
ALTER TABLE "AnnouncementAudience" ADD COLUMN "leaseId" TEXT;
ALTER TABLE "AnnouncementAudience" ADD CONSTRAINT "AnnouncementAudience_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "AnnouncementAudience_leaseId_idx" ON "AnnouncementAudience"("leaseId");
CREATE INDEX "Task_leaseId_tenantId_tenantPortalPublishedAt_idx" ON "Task"("leaseId", "tenantId", "tenantPortalPublishedAt");

ALTER TABLE "Task" ADD COLUMN "tenantPortalPublishedById" TEXT;
ALTER TABLE "Task" ADD CONSTRAINT "Task_tenantPortalPublishedById_fkey" FOREIGN KEY ("tenantPortalPublishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
