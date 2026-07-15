-- V8: oprávnění po nemovitostech, pozvánky, automatická synchronizace a historie banky
CREATE TYPE "PropertyPermission" AS ENUM ('VIEW', 'EDIT', 'ADMIN');
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

ALTER TABLE "UserProperty"
  ADD COLUMN "permission" "PropertyPermission" NOT NULL DEFAULT 'VIEW';

UPDATE "UserProperty" AS up
SET "permission" = CASE
  WHEN u."role" IN ('SUPER_ADMIN', 'MANAGER') THEN 'ADMIN'::"PropertyPermission"
  WHEN u."role" = 'PROPERTY_MANAGER' THEN 'EDIT'::"PropertyPermission"
  ELSE 'ADMIN'::"PropertyPermission"
END
FROM "User" AS u
WHERE u."id" = up."userId";

DROP INDEX IF EXISTS "UserProperty_propertyId_idx";
CREATE INDEX "UserProperty_propertyId_permission_idx" ON "UserProperty"("propertyId", "permission");

CREATE TABLE "UserInvitation" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT,
  "tokenHash" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "permission" "PropertyPermission" NOT NULL DEFAULT 'VIEW',
  "invitedById" TEXT NOT NULL,
  "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserInvitation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserInvitation_tokenHash_key" ON "UserInvitation"("tokenHash");
CREATE INDEX "UserInvitation_propertyId_status_idx" ON "UserInvitation"("propertyId", "status");
CREATE INDEX "UserInvitation_email_status_idx" ON "UserInvitation"("email", "status");
ALTER TABLE "UserInvitation" ADD CONSTRAINT "UserInvitation_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserInvitation" ADD CONSTRAINT "UserInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AppSetting" (
  "id" TEXT NOT NULL DEFAULT 'global',
  "automaticBankSync" BOOLEAN NOT NULL DEFAULT true,
  "bankSyncsPerDay" INTEGER NOT NULL DEFAULT 24,
  "lastCronStartedAt" TIMESTAMP(3),
  "lastCronFinishedAt" TIMESTAMP(3),
  "lastCronSummary" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("id")
);
INSERT INTO "AppSetting" ("id", "automaticBankSync", "bankSyncsPerDay", "createdAt", "updatedAt")
VALUES ('global', true, 24, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "BankAccount"
  ADD COLUMN "lastSyncAttemptAt" TIMESTAMP(3),
  ADD COLUMN "lastSyncError" TEXT,
  ADD COLUMN "autoSyncEnabled" BOOLEAN NOT NULL DEFAULT true;
