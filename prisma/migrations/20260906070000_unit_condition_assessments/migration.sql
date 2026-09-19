-- R8A separates portfolio condition and CAPEX planning from internal distribution.
-- Rollback: drop the immutable trigger/function and UnitConditionAssessment table,
-- then drop UnitConditionPlanStatus. UnitAssetAssessment remains untouched.
CREATE TYPE "UnitConditionPlanStatus" AS ENUM ('MONITORING', 'PLANNED', 'APPROVED', 'IN_PROGRESS', 'COMPLETED');

CREATE TABLE "UnitConditionAssessment" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "rating" "UnitQualityRating" NOT NULL,
    "investmentUrgency" "UnitInvestmentUrgency" NOT NULL,
    "estimatedCapexCents" INTEGER NOT NULL DEFAULT 0,
    "planStatus" "UnitConditionPlanStatus" NOT NULL DEFAULT 'MONITORING',
    "targetDate" TIMESTAMP(3),
    "assessedAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UnitConditionAssessment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "UnitConditionAssessment_capex_check" CHECK ("estimatedCapexCents" >= 0)
);

CREATE INDEX "UnitConditionAssessment_unitId_assessedAt_idx" ON "UnitConditionAssessment"("unitId", "assessedAt");
CREATE INDEX "UnitConditionAssessment_rating_investmentUrgency_idx" ON "UnitConditionAssessment"("rating", "investmentUrgency");
CREATE INDEX "UnitConditionAssessment_planStatus_targetDate_idx" ON "UnitConditionAssessment"("planStatus", "targetDate");

ALTER TABLE "UnitConditionAssessment" ADD CONSTRAINT "UnitConditionAssessment_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UnitConditionAssessment" ADD CONSTRAINT "UnitConditionAssessment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "UnitConditionAssessment" (
    "id", "unitId", "rating", "investmentUrgency", "estimatedCapexCents",
    "planStatus", "targetDate", "assessedAt", "note", "createdById", "createdAt"
)
SELECT
    'r8a-' || "id", "unitId", "rating", "investmentUrgency", "estimatedCapexCents",
    CASE WHEN "investmentUrgency" IN ('PLAN_12_MONTHS', 'IMMEDIATE')
         THEN 'PLANNED'::"UnitConditionPlanStatus"
         ELSE 'MONITORING'::"UnitConditionPlanStatus" END,
    NULL, "assessedAt", "note", "createdById", "createdAt"
FROM "UnitAssetAssessment";

CREATE OR REPLACE FUNCTION "UnitConditionAssessment_immutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'UnitConditionAssessment is immutable; create a new assessment';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "UnitConditionAssessment_immutable_trigger"
BEFORE UPDATE OR DELETE ON "UnitConditionAssessment"
FOR EACH ROW EXECUTE FUNCTION "UnitConditionAssessment_immutable"();
