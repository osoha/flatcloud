ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'TENANT';
ALTER TABLE "UserInvitation" ADD COLUMN "tenantId" TEXT;
CREATE TABLE "TenantPortalAccess" (
  "userId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TenantPortalAccess_pkey" PRIMARY KEY ("userId","tenantId")
);
CREATE INDEX "TenantPortalAccess_tenantId_idx" ON "TenantPortalAccess"("tenantId");
ALTER TABLE "TenantPortalAccess" ADD CONSTRAINT "TenantPortalAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TenantPortalAccess" ADD CONSTRAINT "TenantPortalAccess_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserInvitation" ADD CONSTRAINT "UserInvitation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "UserInvitation_tenantId_idx" ON "UserInvitation"("tenantId");
