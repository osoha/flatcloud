ALTER TABLE "Tenant" ADD COLUMN "dateOfBirth" DATE,
 ADD COLUMN "identityDocumentNumber" TEXT, ADD COLUMN "passportNumber" TEXT,
 ADD COLUMN "createdById" TEXT;
CREATE INDEX "Tenant_createdById_name_idx" ON "Tenant"("createdById", "name");
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- Backfill only recorded creation events; never infer an author from ownership or access.
WITH events AS (
 SELECT CASE WHEN "action" = 'TENANT_CREATED' AND "entityType" = 'Tenant' THEN "entityId"
             WHEN "action" = 'TENANT_AND_LEASE_CREATED' THEN "details"->>'tenantId' END AS tenant_id,
        "userId" AS user_id
 FROM "AuditLog" WHERE "action" IN ('TENANT_CREATED', 'TENANT_AND_LEASE_CREATED') AND "userId" IS NOT NULL
), authors AS (
 SELECT tenant_id, MIN(user_id) AS user_id FROM events
 GROUP BY tenant_id HAVING COUNT(DISTINCT user_id) = 1
)
UPDATE "Tenant" t SET "createdById" = a.user_id FROM authors a JOIN "User" u ON u.id = a.user_id WHERE t.id = a.tenant_id;
