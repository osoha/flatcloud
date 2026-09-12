CREATE TABLE "TenantProperty" (
    "tenantId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantProperty_pkey" PRIMARY KEY ("tenantId", "propertyId")
);

INSERT INTO "TenantProperty" ("tenantId", "propertyId")
SELECT DISTINCT "Lease"."tenantId", "Unit"."propertyId"
FROM "Lease"
JOIN "Unit" ON "Unit"."id" = "Lease"."unitId"
ON CONFLICT DO NOTHING;

INSERT INTO "TenantProperty" ("tenantId", "propertyId")
SELECT DISTINCT "LeaseParty"."tenantId", "Unit"."propertyId"
FROM "LeaseParty"
JOIN "Lease" ON "Lease"."id" = "LeaseParty"."leaseId"
JOIN "Unit" ON "Unit"."id" = "Lease"."unitId"
ON CONFLICT DO NOTHING;

CREATE INDEX "TenantProperty_propertyId_idx" ON "TenantProperty"("propertyId");

ALTER TABLE "TenantProperty" ADD CONSTRAINT "TenantProperty_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TenantProperty" ADD CONSTRAINT "TenantProperty_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
