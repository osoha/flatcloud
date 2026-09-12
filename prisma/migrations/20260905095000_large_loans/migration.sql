-- Loan balances are stored in halers. A normal 60m CZK facility is 6bn halers,
-- which exceeds PostgreSQL INTEGER even though it is an ordinary portfolio value.
ALTER TABLE "PropertyLoan"
  ALTER COLUMN "principalCents" TYPE BIGINT USING "principalCents"::BIGINT,
  ALTER COLUMN "outstandingPrincipalCents" TYPE BIGINT USING "outstandingPrincipalCents"::BIGINT,
  ALTER COLUMN "monthlyDebtServiceCents" TYPE BIGINT USING "monthlyDebtServiceCents"::BIGINT;

ALTER TABLE "PropertyLoanSnapshot"
  ALTER COLUMN "outstandingPrincipalCents" TYPE BIGINT USING "outstandingPrincipalCents"::BIGINT,
  ALTER COLUMN "monthlyDebtServiceCents" TYPE BIGINT USING "monthlyDebtServiceCents"::BIGINT;
