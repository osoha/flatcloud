ALTER TABLE "BankTransaction" ADD COLUMN "expenseRevision" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "BankExpenseAllocation" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "transactionId" TEXT NOT NULL REFERENCES "BankTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "propertyCostId" TEXT REFERENCES "PropertyCost"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "propertyId" TEXT NOT NULL REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "kind" TEXT NOT NULL CHECK ("kind" IN ('COST_PAYMENT','COST_REFUND','ADVANCE','TRANSFER','DEPOSIT_REFUND','LOAN_PRINCIPAL','OTHER')),
 "amountCents" INTEGER NOT NULL CHECK ("amountCents" > 0),
 "reason" TEXT NOT NULL,
 "createdById" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "voidedAt" TIMESTAMP(3), "voidedById" TEXT, "voidReason" TEXT,
 CHECK (("kind" IN ('COST_PAYMENT','COST_REFUND')) = ("propertyCostId" IS NOT NULL))
);
CREATE INDEX "BankExpenseAllocation_transactionId_voidedAt_idx" ON "BankExpenseAllocation"("transactionId","voidedAt");
CREATE INDEX "BankExpenseAllocation_propertyCostId_voidedAt_idx" ON "BankExpenseAllocation"("propertyCostId","voidedAt");
CREATE INDEX "BankExpenseAllocation_propertyId_createdAt_idx" ON "BankExpenseAllocation"("propertyId","createdAt");
