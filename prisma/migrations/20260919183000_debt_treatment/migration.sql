CREATE TYPE "DebtTreatment" AS ENUM ('CURRENT','HISTORICAL','EXCLUDED');
ALTER TABLE "Charge"
  ADD COLUMN "debtTreatment" "DebtTreatment" NOT NULL DEFAULT 'CURRENT',
  ADD COLUMN "debtTreatmentAt" TIMESTAMP(3),
  ADD COLUMN "debtTreatmentReason" TEXT;
