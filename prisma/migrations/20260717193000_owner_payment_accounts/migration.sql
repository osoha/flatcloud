CREATE TABLE "OwnerBankAccount" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "label" TEXT,
  "accountNumber" TEXT,
  "bankCode" TEXT,
  "iban" TEXT,
  "currency" TEXT NOT NULL DEFAULT 'CZK',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OwnerBankAccount_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "UnitOwnership"
  ADD COLUMN "ownerBankAccountId" TEXT;

ALTER TABLE "Lease"
  ADD COLUMN "ownerBankAccountId" TEXT,
  ADD COLUMN "tenantBankAccount" TEXT;

CREATE INDEX "OwnerBankAccount_ownerId_active_idx" ON "OwnerBankAccount"("ownerId", "active");
CREATE INDEX "UnitOwnership_ownerBankAccountId_idx" ON "UnitOwnership"("ownerBankAccountId");
CREATE INDEX "Lease_ownerBankAccountId_idx" ON "Lease"("ownerBankAccountId");

ALTER TABLE "OwnerBankAccount"
  ADD CONSTRAINT "OwnerBankAccount_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UnitOwnership"
  ADD CONSTRAINT "UnitOwnership_ownerBankAccountId_fkey"
  FOREIGN KEY ("ownerBankAccountId") REFERENCES "OwnerBankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Lease"
  ADD CONSTRAINT "Lease_ownerBankAccountId_fkey"
  FOREIGN KEY ("ownerBankAccountId") REFERENCES "OwnerBankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Přenes ručně/online evidované účty vlastníků do nového číselníku platebních účtů.
INSERT INTO "OwnerBankAccount" ("id", "ownerId", "label", "iban", "currency", "active", "createdAt", "updatedAt")
SELECT
  'oba_' || ba."id",
  ba."ownerId",
  COALESCE(ba."accountName", ba."bankName"),
  ba."iban",
  ba."currency",
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "BankAccount" ba
WHERE ba."ownerId" IS NOT NULL
  AND ba."iban" IS NOT NULL
ON CONFLICT ("id") DO NOTHING;

-- Pokud lze účet jednoznačně odvodit z účtu objektu a vlastníka, předvyber ho u jednotky.
UPDATE "UnitOwnership" uo
SET "ownerBankAccountId" = (
  SELECT 'oba_' || ba."id"
  FROM "Unit" u
  JOIN "BankAccount" ba ON ba."propertyId" = u."propertyId"
  WHERE u."id" = uo."unitId"
    AND ba."ownerId" = uo."ownerId"
    AND ba."iban" IS NOT NULL
  ORDER BY ba."id"
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1
  FROM "Unit" u
  JOIN "BankAccount" ba ON ba."propertyId" = u."propertyId"
  WHERE u."id" = uo."unitId"
    AND ba."ownerId" = uo."ownerId"
    AND ba."iban" IS NOT NULL
);

UPDATE "Lease" l
SET "ownerBankAccountId" = (
  SELECT uo."ownerBankAccountId"
  FROM "UnitOwnership" uo
  WHERE uo."unitId" = l."unitId"
    AND uo."ownerBankAccountId" IS NOT NULL
  ORDER BY uo."createdAt"
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1
  FROM "UnitOwnership" uo
  WHERE uo."unitId" = l."unitId"
    AND uo."ownerBankAccountId" IS NOT NULL
);

UPDATE "Lease" l
SET "tenantBankAccount" = t."payerAccounts"[1]
FROM "Tenant" t
WHERE t."id" = l."tenantId"
  AND cardinality(t."payerAccounts") > 0;
