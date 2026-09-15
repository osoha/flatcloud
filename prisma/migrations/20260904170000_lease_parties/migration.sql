-- Additive lease-party foundation. Lease.tenantId remains the canonical primary
-- contracting party for backwards compatibility with existing integrations.
CREATE TYPE "LeasePartyRole" AS ENUM ('CONTRACTING_PARTY', 'PAYER', 'GUARANTOR', 'CONTACT');

CREATE TABLE "LeaseParty" (
    "id" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" "LeasePartyRole" NOT NULL DEFAULT 'CONTRACTING_PARTY',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaseParty_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LeaseParty_primary_role_check" CHECK (NOT "isPrimary" OR "role" = 'CONTRACTING_PARTY')
);

CREATE UNIQUE INDEX "LeaseParty_leaseId_tenantId_role_key"
ON "LeaseParty"("leaseId", "tenantId", "role");

CREATE UNIQUE INDEX "LeaseParty_primary_contracting_party_key"
ON "LeaseParty"("leaseId")
WHERE "isPrimary" = true AND "role" = 'CONTRACTING_PARTY';

CREATE INDEX "LeaseParty_tenantId_leaseId_idx" ON "LeaseParty"("tenantId", "leaseId");
CREATE INDEX "LeaseParty_leaseId_role_idx" ON "LeaseParty"("leaseId", "role");

ALTER TABLE "LeaseParty"
ADD CONSTRAINT "LeaseParty_leaseId_fkey"
FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LeaseParty"
ADD CONSTRAINT "LeaseParty_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill every existing relationship with an explicit primary party. The
-- deterministic prefix keeps the migration repeatable without changing Lease ids.
INSERT INTO "LeaseParty" (
    "id", "leaseId", "tenantId", "role", "isPrimary", "createdAt", "updatedAt"
)
SELECT
    'primary_' || "id",
    "id",
    "tenantId",
    'CONTRACTING_PARTY'::"LeasePartyRole",
    true,
    "createdAt",
    CURRENT_TIMESTAMP
FROM "Lease";
