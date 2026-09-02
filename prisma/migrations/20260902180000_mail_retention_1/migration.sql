-- MAIL-RETENTION-1 is additive. Existing normalized payment and provenance data is preserved.
ALTER TABLE "AppSetting"
  ADD COLUMN "inboundMailLastCleanupSuccessAt" TIMESTAMP(3),
  ADD COLUMN "inboundMailLastCleanupPurged" INTEGER NOT NULL DEFAULT 0;

-- Retained only for backward schema compatibility; runtime policy is the named 100-day constant.
ALTER TABLE "AppSetting"
  ALTER COLUMN "inboundMailResolvedRetentionDays" SET DEFAULT 100,
  ALTER COLUMN "inboundMailUnresolvedRetentionDays" SET DEFAULT 100;

ALTER TABLE "InboxPayment"
  ADD COLUMN "rawPurgedAt" TIMESTAMP(3);

CREATE INDEX "InboxPayment_receivedAt_rawPurgedAt_idx"
  ON "InboxPayment"("receivedAt", "rawPurgedAt");
