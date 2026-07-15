-- V8.1: přímé bankovní konektory a oddělené souhlasy jednotlivých uživatelů
ALTER TABLE "BankAuthorization"
  ADD COLUMN "providerContextEncrypted" TEXT,
  ADD COLUMN "connectedById" TEXT;

ALTER TABLE "BankAccount"
  ADD COLUMN "credentialsEncrypted" TEXT,
  ADD COLUMN "connectedById" TEXT;

ALTER TABLE "BankAuthorization"
  ADD CONSTRAINT "BankAuthorization_connectedById_fkey"
  FOREIGN KEY ("connectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BankAccount"
  ADD CONSTRAINT "BankAccount_connectedById_fkey"
  FOREIGN KEY ("connectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "BankAuthorization_connectedById_idx" ON "BankAuthorization"("connectedById");
CREATE INDEX "BankAccount_connectedById_idx" ON "BankAccount"("connectedById");

DROP INDEX IF EXISTS "BankAccount_externalAccountId_key";
CREATE UNIQUE INDEX "BankAccount_provider_externalAccountId_key" ON "BankAccount"("provider", "externalAccountId");
