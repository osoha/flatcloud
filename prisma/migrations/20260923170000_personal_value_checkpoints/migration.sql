CREATE TYPE "PersonalValueKind" AS ENUM ('LOCAL_MARKET_REFERENCE', 'OFFICIAL_APPRAISAL');

CREATE TABLE "PersonalValueCheckpoint" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "kind" "PersonalValueKind" NOT NULL,
  "valueCents" BIGINT NOT NULL,
  "pricePerSqmCents" BIGINT,
  "asOfDate" TIMESTAMP(3) NOT NULL,
  "windowFrom" TIMESTAMP(3),
  "windowTo" TIMESTAMP(3),
  "transactionCount" INTEGER,
  "sourceName" TEXT NOT NULL,
  "sourceUrl" TEXT,
  "reference" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PersonalValueCheckpoint_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PersonalValueCheckpoint_value_check" CHECK ("valueCents" > 0 AND ("pricePerSqmCents" IS NULL OR "pricePerSqmCents" > 0)),
  CONSTRAINT "PersonalValueCheckpoint_count_check" CHECK ("transactionCount" IS NULL OR "transactionCount" >= 0),
  CONSTRAINT "PersonalValueCheckpoint_window_check" CHECK ("windowFrom" IS NULL OR "windowTo" IS NULL OR "windowTo" >= "windowFrom")
);

CREATE INDEX "PersonalValueCheckpoint_userId_unitId_asOfDate_idx" ON "PersonalValueCheckpoint"("userId", "unitId", "asOfDate");
ALTER TABLE "PersonalValueCheckpoint" ADD CONSTRAINT "PersonalValueCheckpoint_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PersonalValueCheckpoint" ADD CONSTRAINT "PersonalValueCheckpoint_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
