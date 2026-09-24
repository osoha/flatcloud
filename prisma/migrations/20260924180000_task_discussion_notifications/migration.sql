ALTER TABLE "TaskEntry" ADD COLUMN "mentions" JSONB;
CREATE TABLE "TaskEntryReaction" (
 "entryId" TEXT NOT NULL REFERENCES "TaskEntry"("id") ON DELETE CASCADE,
 "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
 "reaction" TEXT NOT NULL CHECK ("reaction" IN ('LIKE','DISLIKE','LOVE','APPLAUSE','LAUGH','SAD')),
 "updatedAt" TIMESTAMP(3) NOT NULL,
 PRIMARY KEY ("entryId", "userId")
);
CREATE TABLE "TaskNotificationPreference" (
 "userId" TEXT PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE,
 "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
 "mentions" BOOLEAN NOT NULL DEFAULT true,
 "assignments" BOOLEAN NOT NULL DEFAULT true,
 "comments" BOOLEAN NOT NULL DEFAULT false,
 "deadlines" BOOLEAN NOT NULL DEFAULT true,
 "statusChanges" BOOLEAN NOT NULL DEFAULT false,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "TaskNotification" (
 "id" TEXT PRIMARY KEY, "dedupeKey" TEXT NOT NULL UNIQUE,
 "taskId" TEXT NOT NULL REFERENCES "Task"("id") ON DELETE CASCADE,
 "entryId" TEXT REFERENCES "TaskEntry"("id") ON DELETE CASCADE,
 "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
 "kind" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING',
 "attempts" INTEGER NOT NULL DEFAULT 0, "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "claimedAt" TIMESTAMP(3), "sentAt" TIMESTAMP(3), "detail" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "TaskNotification_status_nextAttemptAt_idx" ON "TaskNotification"("status", "nextAttemptAt");
CREATE INDEX "TaskNotification_userId_createdAt_idx" ON "TaskNotification"("userId", "createdAt");
CREATE TABLE "TaskNotificationSnapshot" (
 "taskId" TEXT PRIMARY KEY REFERENCES "Task"("id") ON DELETE CASCADE,
 "assigneeId" TEXT, "status" TEXT NOT NULL, "observedAt" TIMESTAMP(3) NOT NULL, "trackingSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Baseline existing tasks, so deployment never sends historical assignment/status mail.
INSERT INTO "TaskNotificationSnapshot" ("taskId", "assigneeId", "status", "observedAt")
 SELECT "id", "assigneeId", "status"::text, "updatedAt" FROM "Task";
