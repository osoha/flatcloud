-- CreateEnum
CREATE TYPE "TenantPortalRequestKind" AS ENUM ('DEFECT', 'MESSAGE', 'CONTACT_CHANGE');

-- AlterEnum
ALTER TYPE "TaskEntryVisibility" ADD VALUE 'TENANT_VISIBLE';

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "tenantPortalRequestKind" "TenantPortalRequestKind";

-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "tenantPortalNotificationQueuedAt" TIMESTAMP(3),
ADD COLUMN     "tenantPortalNotificationRevision" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TaskEntry" ADD COLUMN     "tenantSubmissionKey" TEXT;

-- CreateTable
CREATE TABLE "TenantContactChangeRequest" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "requested" JSONB NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantContactChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantPortalNotification" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "taskId" TEXT,
    "entryId" TEXT,
    "announcementId" TEXT,
    "contactRequestId" TEXT,
    "sourceRevision" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantPortalNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantPortalNotificationSnapshot" (
    "taskId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "observedAt" TIMESTAMP(3) NOT NULL,
    "trackingSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantPortalNotificationSnapshot_pkey" PRIMARY KEY ("taskId")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantContactChangeRequest_taskId_key" ON "TenantContactChangeRequest"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantPortalNotification_dedupeKey_key" ON "TenantPortalNotification"("dedupeKey");

-- CreateIndex
CREATE INDEX "TenantPortalNotification_status_nextAttemptAt_idx" ON "TenantPortalNotification"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "TenantPortalNotification_userId_createdAt_idx" ON "TenantPortalNotification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "TenantPortalNotification_taskId_idx" ON "TenantPortalNotification"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskEntry_tenantSubmissionKey_key" ON "TaskEntry"("tenantSubmissionKey");

-- AddForeignKey
ALTER TABLE "TenantContactChangeRequest" ADD CONSTRAINT "TenantContactChangeRequest_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
