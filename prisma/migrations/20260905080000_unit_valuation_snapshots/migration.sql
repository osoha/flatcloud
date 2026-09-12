CREATE TYPE "UnitValuationSource" AS ENUM ('INTERNAL_COMPARABLES', 'EXTERNAL_APPRAISAL', 'OFFER_PRICE', 'TRANSACTION');
CREATE TABLE "UnitValuationSnapshot" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "marketValueCents" BIGINT NOT NULL,
    "source" "UnitValuationSource" NOT NULL,
    "valuationDate" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UnitValuationSnapshot_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "UnitValuationSnapshot_value_check" CHECK ("marketValueCents" > 0)
);
CREATE INDEX "UnitValuationSnapshot_unitId_valuationDate_idx" ON "UnitValuationSnapshot"("unitId", "valuationDate");
CREATE INDEX "UnitValuationSnapshot_source_valuationDate_idx" ON "UnitValuationSnapshot"("source", "valuationDate");
ALTER TABLE "UnitValuationSnapshot" ADD CONSTRAINT "UnitValuationSnapshot_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UnitValuationSnapshot" ADD CONSTRAINT "UnitValuationSnapshot_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE OR REPLACE FUNCTION "UnitValuationSnapshot_immutable"() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'UnitValuationSnapshot is immutable; create a new valuation'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "UnitValuationSnapshot_immutable_trigger" BEFORE UPDATE OR DELETE ON "UnitValuationSnapshot" FOR EACH ROW EXECUTE FUNCTION "UnitValuationSnapshot_immutable"();
