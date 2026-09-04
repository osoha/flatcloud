CREATE TYPE "UnitQualityRating" AS ENUM ('A_EXCELLENT', 'B_GOOD', 'C_RENOVATE', 'D_MAJOR_WORK');
CREATE TYPE "UnitInvestmentUrgency" AS ENUM ('NONE', 'MONITOR', 'PLAN_12_MONTHS', 'IMMEDIATE');

CREATE TABLE "UnitAssetAssessment" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "rating" "UnitQualityRating" NOT NULL,
    "investmentUrgency" "UnitInvestmentUrgency" NOT NULL,
    "estimatedCapexCents" INTEGER NOT NULL DEFAULT 0,
    "distributionReady" BOOLEAN NOT NULL DEFAULT false,
    "assessedAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UnitAssetAssessment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "UnitAssetAssessment_capex_check" CHECK ("estimatedCapexCents" >= 0)
);

CREATE INDEX "UnitAssetAssessment_unitId_assessedAt_idx" ON "UnitAssetAssessment"("unitId", "assessedAt");
CREATE INDEX "UnitAssetAssessment_rating_investmentUrgency_idx" ON "UnitAssetAssessment"("rating", "investmentUrgency");
ALTER TABLE "UnitAssetAssessment" ADD CONSTRAINT "UnitAssetAssessment_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UnitAssetAssessment" ADD CONSTRAINT "UnitAssetAssessment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "UnitAssetAssessment_immutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'UnitAssetAssessment is immutable; create a new assessment';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "UnitAssetAssessment_immutable_trigger" BEFORE UPDATE OR DELETE ON "UnitAssetAssessment" FOR EACH ROW EXECUTE FUNCTION "UnitAssetAssessment_immutable"();
