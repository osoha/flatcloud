-- AlterTable
ALTER TABLE "BankTransaction" ADD COLUMN     "expenseIgnoreReason" TEXT,
ADD COLUMN     "expenseIgnoredAt" TIMESTAMP(3),
ADD COLUMN     "expenseSuggestedRuleId" TEXT;

-- CreateTable
CREATE TABLE "BankExpenseRule" (
    "id" TEXT NOT NULL,
    "sourcePropertyId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "conditions" JSONB NOT NULL,
    "action" TEXT NOT NULL,
    "targetPropertyId" TEXT NOT NULL,
    "unitId" TEXT,
    "category" "PropertyCostCategory" NOT NULL DEFAULT 'OTHER',
    "costKind" "PropertyCostKind" NOT NULL DEFAULT 'OPEX',
    "createdById" TEXT NOT NULL,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankExpenseRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BankExpenseRule_sourcePropertyId_active_idx" ON "BankExpenseRule"("sourcePropertyId", "active");

-- CreateIndex
CREATE INDEX "BankExpenseRule_bankAccountId_active_idx" ON "BankExpenseRule"("bankAccountId", "active");

-- AddForeignKey
ALTER TABLE "BankExpenseRule" ADD CONSTRAINT "BankExpenseRule_sourcePropertyId_fkey" FOREIGN KEY ("sourcePropertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankExpenseRule" ADD CONSTRAINT "BankExpenseRule_targetPropertyId_fkey" FOREIGN KEY ("targetPropertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankExpenseRule" ADD CONSTRAINT "BankExpenseRule_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankExpenseRule" ADD CONSTRAINT "BankExpenseRule_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankExpenseRule" ADD CONSTRAINT "BankExpenseRule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

