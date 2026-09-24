CREATE TABLE "SystemDailySnapshot" (
  "day" DATE NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "users" INTEGER NOT NULL,
  "activeUsers" INTEGER NOT NULL,
  "testUsers" INTEGER NOT NULL,
  "properties" INTEGER NOT NULL,
  "units" INTEGER NOT NULL,
  CONSTRAINT "SystemDailySnapshot_pkey" PRIMARY KEY ("day")
);
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");
