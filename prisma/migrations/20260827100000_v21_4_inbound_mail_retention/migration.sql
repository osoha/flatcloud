ALTER TABLE "AppSetting"
  ADD COLUMN IF NOT EXISTS "inboundMailUidValidity" TEXT,
  ADD COLUMN IF NOT EXISTS "inboundMailResolvedRetentionDays" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS "inboundMailUnresolvedRetentionDays" INTEGER NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS "inboundMailLastCleanupAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "inboundMailLastCleanupSummary" TEXT;

ALTER TABLE "InboxPayment"
  ADD COLUMN IF NOT EXISTS "imapUidValidity" TEXT,
  ADD COLUMN IF NOT EXISTS "imapMailboxIdentity" TEXT,
  ADD COLUMN IF NOT EXISTS "mailboxDeletedAt" TIMESTAMP(3);