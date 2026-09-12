-- R8B records the atomic hand-off from an approved condition plan to operations and finance.
-- Rollback: drop the immutable trigger/function and UnitConditionPlanExecution table.
-- Generated Task, PropertyCost and PropertyBudgetLine rows are intentionally retained as audit evidence.
CREATE TABLE "UnitConditionPlanExecution" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "propertyCostId" TEXT NOT NULL,
    "budgetLineId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UnitConditionPlanExecution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UnitConditionPlanExecution_assessmentId_key" ON "UnitConditionPlanExecution"("assessmentId");
CREATE UNIQUE INDEX "UnitConditionPlanExecution_taskId_key" ON "UnitConditionPlanExecution"("taskId");
CREATE UNIQUE INDEX "UnitConditionPlanExecution_propertyCostId_key" ON "UnitConditionPlanExecution"("propertyCostId");
CREATE UNIQUE INDEX "UnitConditionPlanExecution_budgetLineId_key" ON "UnitConditionPlanExecution"("budgetLineId");
CREATE INDEX "UnitConditionPlanExecution_propertyId_createdAt_idx" ON "UnitConditionPlanExecution"("propertyId", "createdAt");
CREATE INDEX "UnitConditionPlanExecution_createdById_createdAt_idx" ON "UnitConditionPlanExecution"("createdById", "createdAt");

ALTER TABLE "UnitConditionPlanExecution" ADD CONSTRAINT "UnitConditionPlanExecution_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "UnitConditionAssessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UnitConditionPlanExecution" ADD CONSTRAINT "UnitConditionPlanExecution_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UnitConditionPlanExecution" ADD CONSTRAINT "UnitConditionPlanExecution_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UnitConditionPlanExecution" ADD CONSTRAINT "UnitConditionPlanExecution_propertyCostId_fkey" FOREIGN KEY ("propertyCostId") REFERENCES "PropertyCost"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UnitConditionPlanExecution" ADD CONSTRAINT "UnitConditionPlanExecution_budgetLineId_fkey" FOREIGN KEY ("budgetLineId") REFERENCES "PropertyBudgetLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UnitConditionPlanExecution" ADD CONSTRAINT "UnitConditionPlanExecution_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "UnitConditionPlanExecution_immutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'UnitConditionPlanExecution is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "UnitConditionPlanExecution_immutable_trigger"
BEFORE UPDATE OR DELETE ON "UnitConditionPlanExecution"
FOR EACH ROW EXECUTE FUNCTION "UnitConditionPlanExecution_immutable"();
