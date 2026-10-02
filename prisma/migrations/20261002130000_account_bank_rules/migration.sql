CREATE TABLE "AccountBankRule" (
  "id" TEXT NOT NULL, "fingerprint" TEXT NOT NULL, "ownerBankAccountId" TEXT NOT NULL, "name" TEXT NOT NULL,
  "action" "MatchRuleAction" NOT NULL, "direction" TEXT NOT NULL, "currency" TEXT NOT NULL DEFAULT 'CZK',
  "counterpartyAccount" TEXT, "counterpartyNameContains" TEXT, "variableSymbol" TEXT, "messageContains" TEXT,
  "amountCents" INTEGER, "targetLeaseId" TEXT, "priority" INTEGER NOT NULL DEFAULT 100,
  "active" BOOLEAN NOT NULL DEFAULT true, "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountBankRule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccountBankRule_direction_check" CHECK ("direction" IN ('IN', 'OUT')),
  CONSTRAINT "AccountBankRule_target_check" CHECK (("action" = 'IGNORE' AND "targetLeaseId" IS NULL) OR ("action" <> 'IGNORE' AND "targetLeaseId" IS NOT NULL AND "direction" = 'IN' AND "currency" = 'CZK'))
);
CREATE INDEX "AccountBankRule_ownerBankAccountId_active_priority_idx" ON "AccountBankRule"("ownerBankAccountId", "active", "priority");
ALTER TABLE "AccountBankRule" ADD CONSTRAINT "AccountBankRule_ownerBankAccountId_fkey" FOREIGN KEY ("ownerBankAccountId") REFERENCES "OwnerBankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountBankRule" ADD CONSTRAINT "AccountBankRule_targetLeaseId_fkey" FOREIGN KEY ("targetLeaseId") REFERENCES "Lease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "AccountBankRule_fingerprint_key" ON "AccountBankRule"("fingerprint");
