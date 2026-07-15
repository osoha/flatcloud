-- Více vlastníků na objektu a jednotkách + bankovní autorizace, pravidla a párování.
CREATE TYPE "BankAuthorizationStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'EXPIRED');
CREATE TYPE "MatchRuleAction" AS ENUM ('IGNORE', 'MATCH_LEASE', 'SUGGEST_LEASE');

CREATE TABLE "PropertyOwnership" (
  "id" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "shareBasisPoints" INTEGER NOT NULL DEFAULT 10000,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PropertyOwnership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UnitOwnership" (
  "id" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "shareBasisPoints" INTEGER NOT NULL DEFAULT 10000,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UnitOwnership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BankAuthorization" (
  "id" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "bankName" TEXT NOT NULL,
  "country" TEXT NOT NULL,
  "psuType" TEXT NOT NULL DEFAULT 'business',
  "status" "BankAuthorizationStatus" NOT NULL DEFAULT 'PENDING',
  "externalAuthorizationId" TEXT,
  "externalSessionId" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BankAuthorization_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "BankAccount"
  ADD COLUMN "ownerId" TEXT,
  ADD COLUMN "accountName" TEXT,
  ADD COLUMN "iban" TEXT,
  ADD COLUMN "externalSessionId" TEXT,
  ADD COLUMN "identificationHash" TEXT,
  ADD COLUMN "balanceCents" INTEGER,
  ADD COLUMN "balanceUpdatedAt" TIMESTAMP(3);

CREATE TABLE "BankMatchingRule" (
  "id" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "bankAccountId" TEXT,
  "name" TEXT NOT NULL,
  "action" "MatchRuleAction" NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "counterpartyIban" TEXT,
  "counterpartyNameContains" TEXT,
  "variableSymbol" TEXT,
  "messageContains" TEXT,
  "amountCents" INTEGER,
  "targetLeaseId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BankMatchingRule_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "BankTransaction"
  ADD COLUMN "matchedRuleId" TEXT,
  ADD COLUMN "suggestedLeaseId" TEXT,
  ADD COLUMN "matchNote" TEXT;

CREATE UNIQUE INDEX "PropertyOwnership_propertyId_ownerId_key" ON "PropertyOwnership"("propertyId", "ownerId");
CREATE INDEX "PropertyOwnership_ownerId_idx" ON "PropertyOwnership"("ownerId");
CREATE UNIQUE INDEX "UnitOwnership_unitId_ownerId_key" ON "UnitOwnership"("unitId", "ownerId");
CREATE INDEX "UnitOwnership_ownerId_idx" ON "UnitOwnership"("ownerId");
CREATE UNIQUE INDEX "BankAuthorization_state_key" ON "BankAuthorization"("state");
CREATE INDEX "BankAuthorization_propertyId_status_idx" ON "BankAuthorization"("propertyId", "status");
CREATE INDEX "BankAccount_ownerId_idx" ON "BankAccount"("ownerId");
CREATE INDEX "BankAccount_provider_identificationHash_idx" ON "BankAccount"("provider", "identificationHash");
CREATE INDEX "BankMatchingRule_propertyId_active_priority_idx" ON "BankMatchingRule"("propertyId", "active", "priority");
CREATE INDEX "BankMatchingRule_bankAccountId_idx" ON "BankMatchingRule"("bankAccountId");
CREATE INDEX "BankMatchingRule_targetLeaseId_idx" ON "BankMatchingRule"("targetLeaseId");
CREATE INDEX "BankTransaction_matchedRuleId_idx" ON "BankTransaction"("matchedRuleId");
CREATE INDEX "BankTransaction_suggestedLeaseId_idx" ON "BankTransaction"("suggestedLeaseId");

ALTER TABLE "PropertyOwnership" ADD CONSTRAINT "PropertyOwnership_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PropertyOwnership" ADD CONSTRAINT "PropertyOwnership_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UnitOwnership" ADD CONSTRAINT "UnitOwnership_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UnitOwnership" ADD CONSTRAINT "UnitOwnership_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankAuthorization" ADD CONSTRAINT "BankAuthorization_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BankMatchingRule" ADD CONSTRAINT "BankMatchingRule_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BankMatchingRule" ADD CONSTRAINT "BankMatchingRule_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BankMatchingRule" ADD CONSTRAINT "BankMatchingRule_targetLeaseId_fkey" FOREIGN KEY ("targetLeaseId") REFERENCES "Lease"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_matchedRuleId_fkey" FOREIGN KEY ("matchedRuleId") REFERENCES "BankMatchingRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_suggestedLeaseId_fkey" FOREIGN KEY ("suggestedLeaseId") REFERENCES "Lease"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Každá stávající nemovitost a jednotka dostane dosavadního hlavního vlastníka s podílem 100 %.
INSERT INTO "PropertyOwnership" ("id", "propertyId", "ownerId", "shareBasisPoints", "createdAt", "updatedAt")
SELECT 'po_' || "id", "id", "ownerId", 10000, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "Property"
ON CONFLICT ("propertyId", "ownerId") DO NOTHING;

INSERT INTO "UnitOwnership" ("id", "unitId", "ownerId", "shareBasisPoints", "createdAt", "updatedAt")
SELECT 'uo_' || u."id", u."id", p."ownerId", 10000, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Unit" u JOIN "Property" p ON p."id" = u."propertyId"
ON CONFLICT ("unitId", "ownerId") DO NOTHING;
