CREATE TYPE "RentChangeProposalStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');

CREATE TABLE "RentChangeProposal" (
    "id" TEXT NOT NULL,
    "forecastPlanId" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "status" "RentChangeProposalStatus" NOT NULL DEFAULT 'DRAFT',
    "previousRentCents" INTEGER NOT NULL,
    "proposedRentCents" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "legalBasis" TEXT NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RentChangeProposal_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RentChangeProposal_amount_check" CHECK ("previousRentCents" >= 0 AND "proposedRentCents" > 0 AND "previousRentCents" <> "proposedRentCents"),
    CONSTRAINT "RentChangeProposal_confirmation_check" CHECK (("status" = 'CONFIRMED' AND "confirmedById" IS NOT NULL AND "confirmedAt" IS NOT NULL) OR ("status" <> 'CONFIRMED'))
);

CREATE UNIQUE INDEX "RentChangeProposal_forecastPlanId_leaseId_key" ON "RentChangeProposal"("forecastPlanId", "leaseId");
CREATE INDEX "RentChangeProposal_leaseId_status_effectiveFrom_idx" ON "RentChangeProposal"("leaseId", "status", "effectiveFrom");
CREATE INDEX "RentChangeProposal_status_effectiveFrom_idx" ON "RentChangeProposal"("status", "effectiveFrom");

ALTER TABLE "RentChangeProposal" ADD CONSTRAINT "RentChangeProposal_forecastPlanId_fkey" FOREIGN KEY ("forecastPlanId") REFERENCES "RentForecastPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentChangeProposal" ADD CONSTRAINT "RentChangeProposal_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentChangeProposal" ADD CONSTRAINT "RentChangeProposal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentChangeProposal" ADD CONSTRAINT "RentChangeProposal_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
