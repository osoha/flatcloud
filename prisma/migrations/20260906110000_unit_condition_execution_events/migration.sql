-- R8C keeps CAPEX execution progress append-only while operational task and cost rows reflect current state.
-- Rollback: drop the immutable trigger/function, UnitConditionExecutionEvent table and its enum.
-- Task, cost and audit updates created through the workflow are intentionally retained as operational evidence.
CREATE TYPE "UnitConditionExecutionEventKind" AS ENUM ('STARTED', 'COMPLETED');

CREATE TABLE "UnitConditionExecutionEvent" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "kind" "UnitConditionExecutionEventKind" NOT NULL,
    "actualAmountCents" INTEGER,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UnitConditionExecutionEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UnitConditionExecutionEvent_executionId_kind_key" ON "UnitConditionExecutionEvent"("executionId", "kind");
CREATE INDEX "UnitConditionExecutionEvent_createdById_createdAt_idx" ON "UnitConditionExecutionEvent"("createdById", "createdAt");

ALTER TABLE "UnitConditionExecutionEvent" ADD CONSTRAINT "UnitConditionExecutionEvent_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "UnitConditionPlanExecution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UnitConditionExecutionEvent" ADD CONSTRAINT "UnitConditionExecutionEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "UnitConditionExecutionEvent_immutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'UnitConditionExecutionEvent is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "UnitConditionExecutionEvent_immutable_trigger"
BEFORE UPDATE OR DELETE ON "UnitConditionExecutionEvent"
FOR EACH ROW EXECUTE FUNCTION "UnitConditionExecutionEvent_immutable"();
