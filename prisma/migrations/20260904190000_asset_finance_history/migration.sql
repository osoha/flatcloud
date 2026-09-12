-- CreateTable
CREATE TABLE "PropertyBudgetLine" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "kind" "PropertyCostKind" NOT NULL,
    "category" "PropertyCostCategory" NOT NULL DEFAULT 'OTHER',
    "title" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertyBudgetLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PropertyBudgetLine_year_check" CHECK ("year" BETWEEN 2000 AND 2200),
    CONSTRAINT "PropertyBudgetLine_amountCents_check" CHECK ("amountCents" > 0)
);

-- CreateTable
CREATE TABLE "PropertyLoanSnapshot" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "asOfDate" TIMESTAMP(3) NOT NULL,
    "outstandingPrincipalCents" INTEGER NOT NULL,
    "annualInterestRateBps" INTEGER NOT NULL,
    "monthlyDebtServiceCents" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PropertyLoanSnapshot_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PropertyLoanSnapshot_outstandingPrincipalCents_check" CHECK ("outstandingPrincipalCents" >= 0),
    CONSTRAINT "PropertyLoanSnapshot_annualInterestRateBps_check" CHECK ("annualInterestRateBps" BETWEEN 0 AND 10000),
    CONSTRAINT "PropertyLoanSnapshot_monthlyDebtServiceCents_check" CHECK ("monthlyDebtServiceCents" IS NULL OR "monthlyDebtServiceCents" >= 0)
);

-- CreateIndex
CREATE INDEX "PropertyBudgetLine_propertyId_year_idx" ON "PropertyBudgetLine"("propertyId", "year");

-- CreateIndex
CREATE INDEX "PropertyBudgetLine_propertyId_year_kind_category_idx" ON "PropertyBudgetLine"("propertyId", "year", "kind", "category");

-- CreateIndex
CREATE INDEX "PropertyLoanSnapshot_loanId_asOfDate_idx" ON "PropertyLoanSnapshot"("loanId", "asOfDate");

-- AddForeignKey
ALTER TABLE "PropertyBudgetLine" ADD CONSTRAINT "PropertyBudgetLine_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyLoanSnapshot" ADD CONSTRAINT "PropertyLoanSnapshot_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "PropertyLoan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill one immutable opening snapshot for every existing loan.
INSERT INTO "PropertyLoanSnapshot" (
    "id",
    "loanId",
    "asOfDate",
    "outstandingPrincipalCents",
    "annualInterestRateBps",
    "monthlyDebtServiceCents",
    "note"
)
SELECT
    'opening_' || "id",
    "id",
    "updatedAt",
    "outstandingPrincipalCents",
    "annualInterestRateBps",
    "monthlyDebtServiceCents",
    'Výchozí stav při zavedení historie'
FROM "PropertyLoan";
