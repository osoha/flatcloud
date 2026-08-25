-- V21 Operations Foundation: tasks, threaded case notes, important contacts,
-- compliance/revisions and property-scoped audit log.

CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING', 'DONE', 'CANCELLED');
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
CREATE TYPE "TaskCategory" AS ENUM ('COLLECTION', 'MAINTENANCE', 'LEASE', 'COMPLIANCE', 'GENERAL');
CREATE TYPE "TaskEntryKind" AS ENUM ('COMMENT', 'CALL', 'EMAIL', 'PROMISE', 'STATUS', 'SYSTEM');
CREATE TYPE "ComplianceResult" AS ENUM ('OK', 'ISSUE', 'FOLLOW_UP');
CREATE TYPE "ContactCategory" AS ENUM ('MANAGER', 'EMERGENCY', 'ELECTRICIAN', 'PLUMBER', 'HEATING', 'ELEVATOR', 'FIRE_SAFETY', 'INSPECTION', 'INSURANCE', 'CLEANING', 'UTILITY', 'OTHER');

ALTER TABLE "OwnerBankAccount"
  ADD COLUMN "lastNotificationAt" TIMESTAMP(3);

ALTER TABLE "AuditLog"
  ADD COLUMN "propertyId" TEXT;


CREATE TABLE "PropertyPaymentAccount" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "ownerBankAccountId" TEXT NOT NULL,
    "primary" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notificationVerifiedAt" TIMESTAMP(3),
    "lastNotificationAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PropertyPaymentAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PropertyPaymentAccount_propertyId_ownerBankAccountId_key" ON "PropertyPaymentAccount"("propertyId", "ownerBankAccountId");
CREATE INDEX "PropertyPaymentAccount_ownerBankAccountId_active_idx" ON "PropertyPaymentAccount"("ownerBankAccountId", "active");
CREATE INDEX "PropertyPaymentAccount_propertyId_active_idx" ON "PropertyPaymentAccount"("propertyId", "active");
ALTER TABLE "PropertyPaymentAccount" ADD CONSTRAINT "PropertyPaymentAccount_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PropertyPaymentAccount" ADD CONSTRAINT "PropertyPaymentAccount_ownerBankAccountId_fkey" FOREIGN KEY ("ownerBankAccountId") REFERENCES "OwnerBankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Přeneseme existující vazby ze smluv a vlastnictví jednotek do nové explicitní vazby objekt ↔ účet.
INSERT INTO "PropertyPaymentAccount" ("id", "propertyId", "ownerBankAccountId", "primary", "active", "createdAt", "updatedAt")
SELECT 'v21-lease-' || md5(u."propertyId" || ':' || l."ownerBankAccountId"), u."propertyId", l."ownerBankAccountId", false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Lease" l JOIN "Unit" u ON u."id" = l."unitId"
WHERE l."ownerBankAccountId" IS NOT NULL
ON CONFLICT ("propertyId", "ownerBankAccountId") DO NOTHING;

INSERT INTO "PropertyPaymentAccount" ("id", "propertyId", "ownerBankAccountId", "primary", "active", "createdAt", "updatedAt")
SELECT 'v21-owner-' || md5(u."propertyId" || ':' || o."ownerBankAccountId"), u."propertyId", o."ownerBankAccountId", false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "UnitOwnership" o JOIN "Unit" u ON u."id" = o."unitId"
WHERE o."ownerBankAccountId" IS NOT NULL
ON CONFLICT ("propertyId", "ownerBankAccountId") DO NOTHING;

CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "TaskCategory" NOT NULL DEFAULT 'GENERAL',
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "TaskPriority" NOT NULL DEFAULT 'NORMAL',
    "propertyId" TEXT NOT NULL,
    "unitId" TEXT,
    "leaseId" TEXT,
    "tenantId" TEXT,
    "createdById" TEXT,
    "assigneeId" TEXT,
    "dueAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TaskEntry" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "authorId" TEXT,
    "kind" "TaskEntryKind" NOT NULL DEFAULT 'COMMENT',
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PropertyContact" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "category" "ContactCategory" NOT NULL DEFAULT 'OTHER',
    "name" TEXT NOT NULL,
    "company" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "note" TEXT,
    "emergency" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PropertyContact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ComplianceItem" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "frequencyMonths" INTEGER,
    "lastCompletedAt" TIMESTAMP(3),
    "nextDueAt" TIMESTAMP(3) NOT NULL,
    "assignedContactId" TEXT,
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ComplianceItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ComplianceRecord" (
    "id" TEXT NOT NULL,
    "complianceItemId" TEXT NOT NULL,
    "performedAt" TIMESTAMP(3) NOT NULL,
    "result" "ComplianceResult" NOT NULL DEFAULT 'OK',
    "note" TEXT,
    "documentUrl" TEXT,
    "nextDueAt" TIMESTAMP(3),
    "performedBy" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ComplianceRecord_pkey" PRIMARY KEY ("id")
);

-- Nové a budoucí aktivní smlouvy na stejném příjmovém účtu nesmějí sdílet VS.
-- Kombinace účet + VS je hlavní identifikátor příchozí platby.
CREATE UNIQUE INDEX "Lease_active_owner_account_vs_key"
ON "Lease"("ownerBankAccountId", "variableSymbol")
WHERE "ownerBankAccountId" IS NOT NULL AND "status" IN ('ACTIVE', 'FUTURE');

CREATE UNIQUE INDEX "Task_dedupeKey_key" ON "Task"("dedupeKey");
CREATE INDEX "Task_propertyId_status_dueAt_idx" ON "Task"("propertyId", "status", "dueAt");
CREATE INDEX "Task_assigneeId_status_dueAt_idx" ON "Task"("assigneeId", "status", "dueAt");
CREATE INDEX "Task_leaseId_category_status_idx" ON "Task"("leaseId", "category", "status");
CREATE INDEX "TaskEntry_taskId_createdAt_idx" ON "TaskEntry"("taskId", "createdAt");
CREATE INDEX "TaskEntry_authorId_createdAt_idx" ON "TaskEntry"("authorId", "createdAt");
CREATE INDEX "PropertyContact_propertyId_active_sortOrder_idx" ON "PropertyContact"("propertyId", "active", "sortOrder");
CREATE INDEX "ComplianceItem_propertyId_active_nextDueAt_idx" ON "ComplianceItem"("propertyId", "active", "nextDueAt");
CREATE INDEX "ComplianceItem_assignedContactId_idx" ON "ComplianceItem"("assignedContactId");
CREATE INDEX "ComplianceRecord_complianceItemId_performedAt_idx" ON "ComplianceRecord"("complianceItemId", "performedAt");
CREATE INDEX "ComplianceRecord_createdById_createdAt_idx" ON "ComplianceRecord"("createdById", "createdAt");
CREATE INDEX "AuditLog_propertyId_createdAt_idx" ON "AuditLog"("propertyId", "createdAt");

ALTER TABLE "Task" ADD CONSTRAINT "Task_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TaskEntry" ADD CONSTRAINT "TaskEntry_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskEntry" ADD CONSTRAINT "TaskEntry_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PropertyContact" ADD CONSTRAINT "PropertyContact_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComplianceItem" ADD CONSTRAINT "ComplianceItem_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComplianceItem" ADD CONSTRAINT "ComplianceItem_assignedContactId_fkey" FOREIGN KEY ("assignedContactId") REFERENCES "PropertyContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ComplianceRecord" ADD CONSTRAINT "ComplianceRecord_complianceItemId_fkey" FOREIGN KEY ("complianceItemId") REFERENCES "ComplianceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComplianceRecord" ADD CONSTRAINT "ComplianceRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Sandbox V21 cleanup: remove the abandoned direct bank API connection model.
DROP TABLE IF EXISTS "BankAuthorization" CASCADE;
DROP TYPE IF EXISTS "BankAuthorizationStatus";

ALTER TABLE "AppSetting"
  DROP COLUMN IF EXISTS "automaticBankSync",
  DROP COLUMN IF EXISTS "bankSyncsPerDay",
  DROP COLUMN IF EXISTS "lastCronStartedAt",
  DROP COLUMN IF EXISTS "lastCronFinishedAt",
  DROP COLUMN IF EXISTS "lastCronSummary";

ALTER TABLE "BankAccount"
  DROP COLUMN IF EXISTS "externalSessionId",
  DROP COLUMN IF EXISTS "credentialsEncrypted",
  DROP COLUMN IF EXISTS "connectedById",
  DROP COLUMN IF EXISTS "identificationHash",
  DROP COLUMN IF EXISTS "connectionStatus",
  DROP COLUMN IF EXISTS "consentExpiresAt",
  DROP COLUMN IF EXISTS "balanceCents",
  DROP COLUMN IF EXISTS "balanceUpdatedAt",
  DROP COLUMN IF EXISTS "lastSyncedAt",
  DROP COLUMN IF EXISTS "lastSyncAttemptAt",
  DROP COLUMN IF EXISTS "lastSyncError",
  DROP COLUMN IF EXISTS "autoSyncEnabled";

DROP TYPE IF EXISTS "BankConnectionStatus";

ALTER TABLE "BankTransaction" ALTER COLUMN "source" SET DEFAULT 'manual';
