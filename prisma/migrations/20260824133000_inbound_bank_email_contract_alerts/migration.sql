-- FlatCloud Rent V20: sběrný e-mail bankovních notifikací, RB parser a globální fronta nespárovaných plateb.
CREATE TYPE "InboxPaymentStatus" AS ENUM ('RECEIVED', 'UNMATCHED', 'IMPORTED', 'IGNORED', 'ERROR');

ALTER TABLE "AppSetting"
  ADD COLUMN "inboundMailEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "inboundMailHost" TEXT,
  ADD COLUMN "inboundMailPort" INTEGER NOT NULL DEFAULT 993,
  ADD COLUMN "inboundMailSecure" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "inboundMailUser" TEXT,
  ADD COLUMN "inboundMailPasswordEncrypted" TEXT,
  ADD COLUMN "inboundMailMailbox" TEXT NOT NULL DEFAULT 'INBOX',
  ADD COLUMN "inboundMailLastUid" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "inboundMailLastCheckedAt" TIMESTAMP(3),
  ADD COLUMN "inboundMailLastSummary" TEXT;

ALTER TABLE "BankTransaction"
  ADD COLUMN "recipientAccount" TEXT,
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'api';

CREATE TABLE "InboxPayment" (
  "id" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'email',
  "bank" TEXT NOT NULL DEFAULT 'RB',
  "messageId" TEXT,
  "imapUid" INTEGER,
  "subject" TEXT,
  "sender" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "bookedAt" TIMESTAMP(3),
  "amountCents" INTEGER,
  "currency" TEXT NOT NULL DEFAULT 'CZK',
  "recipientAccount" TEXT,
  "counterpartyName" TEXT,
  "counterpartyAccount" TEXT,
  "variableSymbol" TEXT,
  "specificSymbol" TEXT,
  "constantSymbol" TEXT,
  "message" TEXT,
  "rawExcerpt" TEXT,
  "status" "InboxPaymentStatus" NOT NULL DEFAULT 'RECEIVED',
  "parseNote" TEXT,
  "propertyId" TEXT,
  "transactionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InboxPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InboxPayment_messageId_key" ON "InboxPayment"("messageId");
CREATE UNIQUE INDEX "InboxPayment_transactionId_key" ON "InboxPayment"("transactionId");
CREATE INDEX "InboxPayment_status_receivedAt_idx" ON "InboxPayment"("status", "receivedAt");
CREATE INDEX "InboxPayment_propertyId_status_idx" ON "InboxPayment"("propertyId", "status");
CREATE INDEX "InboxPayment_imapUid_idx" ON "InboxPayment"("imapUid");

ALTER TABLE "InboxPayment" ADD CONSTRAINT "InboxPayment_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InboxPayment" ADD CONSTRAINT "InboxPayment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "BankTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
