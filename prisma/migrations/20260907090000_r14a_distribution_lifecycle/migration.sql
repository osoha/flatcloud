CREATE TYPE "DistributionOptionStatus" AS ENUM ('NONE', 'PREPARING', 'OFFERED', 'SIGNED', 'EXERCISED', 'EXPIRED', 'CANCELLED');

ALTER TABLE "DistributionOpportunity"
  ADD COLUMN "optionStatus" "DistributionOptionStatus" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "optionExpiresAt" TIMESTAMP(3),
  ADD COLUMN "optionPriceCents" BIGINT,
  ADD COLUMN "optionReference" TEXT;

CREATE TABLE "DistributionOpportunityEvent" (
  "id" TEXT NOT NULL,
  "opportunityId" TEXT NOT NULL,
  "fromStage" "DistributionOpportunityStage",
  "toStage" "DistributionOpportunityStage" NOT NULL,
  "optionStatus" "DistributionOptionStatus" NOT NULL,
  "askingPriceCents" BIGINT,
  "offeredPriceCents" BIGINT,
  "optionPriceCents" BIGINT,
  "optionReference" TEXT,
  "optionExpiresAt" TIMESTAMP(3),
  "nextActionAt" TIMESTAMP(3),
  "note" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DistributionOpportunityEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DistributionOpportunityEvent_prices_check" CHECK (("askingPriceCents" IS NULL OR "askingPriceCents" > 0) AND ("offeredPriceCents" IS NULL OR "offeredPriceCents" > 0) AND ("optionPriceCents" IS NULL OR "optionPriceCents" > 0))
);

CREATE INDEX "DistributionOpportunityEvent_opportunityId_createdAt_idx" ON "DistributionOpportunityEvent"("opportunityId", "createdAt");
CREATE INDEX "DistributionOpportunity_optionStatus_optionExpiresAt_idx" ON "DistributionOpportunity"("optionStatus", "optionExpiresAt");

INSERT INTO "DistributionOpportunityEvent" (
  "id", "opportunityId", "fromStage", "toStage", "optionStatus",
  "askingPriceCents", "offeredPriceCents", "optionPriceCents", "optionReference",
  "optionExpiresAt", "nextActionAt", "note", "createdById", "createdAt"
)
SELECT
  'r14a_' || md5("id"), "id", NULL, "stage", 'NONE',
  "askingPriceCents", "offeredPriceCents", NULL, NULL,
  NULL, "nextActionAt", "note", "createdById", "createdAt"
FROM "DistributionOpportunity";

ALTER TABLE "DistributionOpportunity" ADD CONSTRAINT "DistributionOpportunity_optionPrice_check" CHECK ("optionPriceCents" IS NULL OR "optionPriceCents" > 0);
ALTER TABLE "DistributionOpportunityEvent" ADD CONSTRAINT "DistributionOpportunityEvent_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "DistributionOpportunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DistributionOpportunityEvent" ADD CONSTRAINT "DistributionOpportunityEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
