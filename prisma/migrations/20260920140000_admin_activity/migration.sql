CREATE TABLE "UserActivity" (
  "userId" TEXT NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserActivity_pkey" PRIMARY KEY ("userId")
);
CREATE INDEX "UserActivity_lastSeenAt_idx" ON "UserActivity"("lastSeenAt");
ALTER TABLE "UserActivity" ADD CONSTRAINT "UserActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
