CREATE TYPE "TenantPortalInvitationMode" AS ENUM ('MANUAL', 'AUTOMATIC');
ALTER TABLE "Property" ADD COLUMN "tenantPortalInvitationMode" "TenantPortalInvitationMode" NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "Lease" ADD COLUMN "autoPortalInvitationPending" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UserInvitation" ADD COLUMN "tokenEncrypted" TEXT, ADD COLUMN "deliveryError" TEXT, ADD COLUMN "sentAt" TIMESTAMP(3);
CREATE INDEX "Lease_autoPortalInvitationPending_startDate_idx" ON "Lease"("autoPortalInvitationPending", "startDate");
