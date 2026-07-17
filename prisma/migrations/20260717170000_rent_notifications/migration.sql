CREATE TYPE "NotificationType" AS ENUM ('PAYMENT_NOTICE', 'FIRST_REMINDER', 'SECOND_REMINDER', 'MANAGER_ALERT', 'ESCALATION');
CREATE TYPE "NotificationStatus" AS ENUM ('SENT', 'FAILED', 'SKIPPED');

ALTER TABLE "AppSetting"
  ADD COLUMN "smtpHost" TEXT,
  ADD COLUMN "smtpPort" INTEGER NOT NULL DEFAULT 587,
  ADD COLUMN "smtpSecure" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "smtpUser" TEXT,
  ADD COLUMN "smtpPasswordEncrypted" TEXT,
  ADD COLUMN "smtpFromName" TEXT,
  ADD COLUMN "smtpFromEmail" TEXT,
  ADD COLUMN "smtpReplyTo" TEXT,
  ADD COLUMN "remindersEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "reminderSendHour" INTEGER NOT NULL DEFAULT 8,
  ADD COLUMN "paymentNoticeDaysBefore" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "firstReminderDaysAfter" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "secondReminderDaysAfter" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN "managerAlertDaysAfter" INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN "escalationDaysAfter" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "paymentNoticeSubject" TEXT NOT NULL DEFAULT 'Platební údaje k nájmu – {{property}} / {{unit}}',
  ADD COLUMN "paymentNoticeBody" TEXT NOT NULL DEFAULT E'Dobrý den,\n\nzasíláme platební údaje k předpisu za období {{period}} se splatností {{dueDate}}.\n\nČástka: {{amount}}\nČíslo účtu / IBAN: {{iban}}\nVariabilní symbol: {{variableSymbol}}\n\nDěkujeme za včasnou úhradu.',
  ADD COLUMN "firstReminderSubject" TEXT NOT NULL DEFAULT 'Upozornění na neuhrazený předpis – {{property}} / {{unit}}',
  ADD COLUMN "firstReminderBody" TEXT NOT NULL DEFAULT E'Dobrý den,\n\nk dnešnímu dni neevidujeme úplnou úhradu předpisu po splatnosti. Je možné, že platba ještě nebyla spárována.\n\nAktuální dluh: {{outstanding}}\nČíslo účtu / IBAN: {{iban}}\nVariabilní symbol: {{variableSymbol}}\n\nProsíme o kontrolu platby nebo kontaktování správce.',
  ADD COLUMN "secondReminderSubject" TEXT NOT NULL DEFAULT 'Druhá upomínka – {{property}} / {{unit}}',
  ADD COLUMN "secondReminderBody" TEXT NOT NULL DEFAULT E'Dobrý den,\n\nani po předchozím upozornění neevidujeme úplnou úhradu závazků po splatnosti.\n\nAktuální dluh: {{outstanding}}\nNejstarší splatnost: {{oldestDueDate}}\nČíslo účtu / IBAN: {{iban}}\nVariabilní symbol: {{variableSymbol}}\n\nProsíme o neprodlenou úhradu nebo kontaktování správce.',
  ADD COLUMN "lastReminderCronStartedAt" TIMESTAMP(3),
  ADD COLUMN "lastReminderCronFinishedAt" TIMESTAMP(3),
  ADD COLUMN "lastReminderCronSummary" TEXT;

ALTER TABLE "Lease"
  ADD COLUMN "remindersPausedUntil" TIMESTAMP(3),
  ADD COLUMN "reminderPauseReason" TEXT,
  ADD COLUMN "promisedPaymentDate" TIMESTAMP(3),
  ADD COLUMN "promisedAmountCents" INTEGER,
  ADD COLUMN "collectionNote" TEXT;

CREATE TABLE "RentNotification" (
  "id" TEXT NOT NULL,
  "leaseId" TEXT NOT NULL,
  "chargeId" TEXT,
  "type" "NotificationType" NOT NULL,
  "status" "NotificationStatus" NOT NULL,
  "recipient" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "referenceDate" TIMESTAMP(3) NOT NULL,
  "outstandingCents" INTEGER NOT NULL DEFAULT 0,
  "messageId" TEXT,
  "error" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RentNotification_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RentNotification_leaseId_type_referenceDate_key" ON "RentNotification"("leaseId", "type", "referenceDate");
CREATE INDEX "RentNotification_leaseId_createdAt_idx" ON "RentNotification"("leaseId", "createdAt");
CREATE INDEX "RentNotification_chargeId_idx" ON "RentNotification"("chargeId");
ALTER TABLE "RentNotification" ADD CONSTRAINT "RentNotification_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RentNotification" ADD CONSTRAINT "RentNotification_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "Charge"("id") ON DELETE SET NULL ON UPDATE CASCADE;
