ALTER TABLE "Lease"
  ADD COLUMN "autoChargesEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "indexationEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "indexationPercentBps" INTEGER,
  ADD COLUMN "nextIndexationAt" TIMESTAMP(3);

ALTER TABLE "TaskEntry"
  ADD COLUMN "promisedPaymentDate" TIMESTAMP(3),
  ADD COLUMN "promisedAmountCents" INTEGER;
