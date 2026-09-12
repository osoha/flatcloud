CREATE TYPE "DistributionOpportunityStage" AS ENUM ('NEW','CONTACTED','QUALIFIED','VIEWING','OFFER','RESERVED','WON','LOST');
CREATE TABLE "DistributionProspect" (
  "id" TEXT NOT NULL,"name" TEXT NOT NULL,"email" TEXT,"phone" TEXT,"source" TEXT,"note" TEXT,"active" BOOLEAN NOT NULL DEFAULT true,"createdById" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DistributionProspect_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DistributionOpportunity" (
  "id" TEXT NOT NULL,"prospectId" TEXT NOT NULL,"unitId" TEXT NOT NULL,"stage" "DistributionOpportunityStage" NOT NULL DEFAULT 'NEW',"askingPriceCents" BIGINT,"offeredPriceCents" BIGINT,"nextActionAt" TIMESTAMP(3),"note" TEXT,"createdById" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DistributionOpportunity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DistributionOpportunity_prices_check" CHECK (("askingPriceCents" IS NULL OR "askingPriceCents" > 0) AND ("offeredPriceCents" IS NULL OR "offeredPriceCents" > 0))
);
CREATE INDEX "DistributionProspect_active_name_idx" ON "DistributionProspect"("active","name");
CREATE UNIQUE INDEX "DistributionOpportunity_prospectId_unitId_key" ON "DistributionOpportunity"("prospectId","unitId");
CREATE INDEX "DistributionOpportunity_unitId_stage_idx" ON "DistributionOpportunity"("unitId","stage");
CREATE INDEX "DistributionOpportunity_stage_nextActionAt_idx" ON "DistributionOpportunity"("stage","nextActionAt");
ALTER TABLE "DistributionProspect" ADD CONSTRAINT "DistributionProspect_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DistributionOpportunity" ADD CONSTRAINT "DistributionOpportunity_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "DistributionProspect"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DistributionOpportunity" ADD CONSTRAINT "DistributionOpportunity_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DistributionOpportunity" ADD CONSTRAINT "DistributionOpportunity_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
