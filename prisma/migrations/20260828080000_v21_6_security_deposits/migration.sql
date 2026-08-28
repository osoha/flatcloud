-- CreateEnum
CREATE TYPE "SecurityDepositMovementType" AS ENUM ('RECEIVED', 'RETURNED', 'OFFSET', 'ADJUSTMENT_INCREASE', 'ADJUSTMENT_DECREASE', 'INTEREST_PAID', 'INTEREST_ADJUSTMENT_INCREASE', 'INTEREST_ADJUSTMENT_DECREASE');

-- CreateEnum
CREATE TYPE "LeaseCreditType" AS ENUM ('SERVICE_SETTLEMENT', 'MANUAL_ADJUSTMENT');

-- AlterTable
ALTER TABLE "OwnerBankAccount" ADD COLUMN "notificationVerifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SecurityDepositTerm" (
    "id" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "agreedAmountCents" INTEGER NOT NULL,
    "annualRateBps" INTEGER NOT NULL DEFAULT 0,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SecurityDepositTerm_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SecurityDepositMovement" (
    "id" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "type" "SecurityDepositMovementType" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "bankTransactionId" TEXT,
    "offsetChargeId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SecurityDepositMovement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LeaseCredit" (
    "id" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "type" "LeaseCreditType" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeaseCredit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LeaseCreditApplication" (
    "id" TEXT NOT NULL,
    "creditId" TEXT NOT NULL,
    "chargeId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeaseCreditApplication_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SecurityDepositTerm" ADD CONSTRAINT "SecurityDepositTerm_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SecurityDepositTerm" ADD CONSTRAINT "SecurityDepositTerm_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SecurityDepositMovement" ADD CONSTRAINT "SecurityDepositMovement_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SecurityDepositMovement" ADD CONSTRAINT "SecurityDepositMovement_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SecurityDepositMovement" ADD CONSTRAINT "SecurityDepositMovement_offsetChargeId_fkey" FOREIGN KEY ("offsetChargeId") REFERENCES "Charge"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SecurityDepositMovement" ADD CONSTRAINT "SecurityDepositMovement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LeaseCredit" ADD CONSTRAINT "LeaseCredit_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeaseCredit" ADD CONSTRAINT "LeaseCredit_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LeaseCreditApplication" ADD CONSTRAINT "LeaseCreditApplication_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "LeaseCredit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeaseCreditApplication" ADD CONSTRAINT "LeaseCreditApplication_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "Charge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeaseCreditApplication" ADD CONSTRAINT "LeaseCreditApplication_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "SecurityDepositTerm_leaseId_effectiveFrom_idx" ON "SecurityDepositTerm"("leaseId", "effectiveFrom");
CREATE INDEX "SecurityDepositMovement_leaseId_effectiveAt_idx" ON "SecurityDepositMovement"("leaseId", "effectiveAt");
CREATE INDEX "SecurityDepositMovement_bankTransactionId_idx" ON "SecurityDepositMovement"("bankTransactionId");
CREATE INDEX "SecurityDepositMovement_offsetChargeId_idx" ON "SecurityDepositMovement"("offsetChargeId");
CREATE INDEX "LeaseCredit_leaseId_effectiveAt_idx" ON "LeaseCredit"("leaseId", "effectiveAt");
CREATE INDEX "LeaseCreditApplication_creditId_idx" ON "LeaseCreditApplication"("creditId");
CREATE INDEX "LeaseCreditApplication_chargeId_idx" ON "LeaseCreditApplication"("chargeId");

ALTER TABLE "SecurityDepositMovement" ADD CONSTRAINT "SecurityDepositMovement_amountCents_check" CHECK ("amountCents" > 0);
ALTER TABLE "SecurityDepositTerm" ADD CONSTRAINT "SecurityDepositTerm_agreedAmountCents_check" CHECK ("agreedAmountCents" >= 0);
ALTER TABLE "SecurityDepositTerm" ADD CONSTRAINT "SecurityDepositTerm_annualRateBps_check" CHECK ("annualRateBps" >= 0);
ALTER TABLE "LeaseCredit" ADD CONSTRAINT "LeaseCredit_amountCents_check" CHECK ("amountCents" > 0);
ALTER TABLE "LeaseCreditApplication" ADD CONSTRAINT "LeaseCreditApplication_amountCents_check" CHECK ("amountCents" > 0);

-- Preserve legacy link-level verification when promoting it to account-level state.
UPDATE "OwnerBankAccount" account
SET "notificationVerifiedAt" = latest."verifiedAt"
FROM (
  SELECT "ownerBankAccountId", MAX("notificationVerifiedAt") AS "verifiedAt"
  FROM "PropertyPaymentAccount"
  WHERE "notificationVerifiedAt" IS NOT NULL
  GROUP BY "ownerBankAccountId"
) latest
WHERE account.id = latest."ownerBankAccountId";
