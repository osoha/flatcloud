-- Additive association only; existing costs and evidence remain untouched.
ALTER TABLE "PropertyCost" ADD COLUMN "budgetLineId" TEXT;
CREATE INDEX "PropertyCost_budgetLineId_idx" ON "PropertyCost"("budgetLineId");
ALTER TABLE "PropertyCost" ADD CONSTRAINT "PropertyCost_budgetLineId_fkey"
  FOREIGN KEY ("budgetLineId") REFERENCES "PropertyBudgetLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
