ALTER TABLE "User" ADD COLUMN "flatcloudMember" BOOLEAN NOT NULL DEFAULT false;
-- Preserve explicitly granted corporate reporting access; property ownership/management is never evidence of membership.
UPDATE "User" SET "flatcloudMember" = true WHERE "role" = 'SUPER_ADMIN' OR "id" IN (SELECT "userId" FROM "ReportingGroupMember");
CREATE TABLE "UserPrivateToolSettings" (
  "userId" TEXT NOT NULL PRIMARY KEY,
  "mapsKeyEncrypted" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserPrivateToolSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
