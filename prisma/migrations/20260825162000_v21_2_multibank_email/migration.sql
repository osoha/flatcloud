-- V21.2: bank-agnostic e-mail notifications.
ALTER TABLE "InboxPayment" ALTER COLUMN "bank" SET DEFAULT 'UNKNOWN';

ALTER TABLE "InboxPayment"
  ADD COLUMN "returnPath" TEXT,
  ADD COLUMN "authenticationResults" TEXT,
  ADD COLUMN "sourceTrusted" BOOLEAN NOT NULL DEFAULT false;

-- Normalize historical bank labels to Czech payment-system bank codes.
UPDATE "InboxPayment" SET "bank" = '5500' WHERE "bank" = 'RB';
UPDATE "InboxPayment" SET "bank" = '0800' WHERE "bank" = 'CS';

UPDATE "BankAccount"
SET
  "provider" = 'bank-email',
  "externalAccountId" = regexp_replace("externalAccountId", '^rb-email:', 'bank-email:')
WHERE "provider" = 'rb-email';

UPDATE "BankTransaction"
SET "source" = 'email-bank'
WHERE "source" = 'email-rb';
