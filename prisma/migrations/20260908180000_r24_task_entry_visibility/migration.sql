CREATE TYPE "TaskEntryVisibility" AS ENUM ('INTERNAL', 'OWNER_VISIBLE');
-- Preserve already shared history; subsequent inserts default to internal.
ALTER TABLE "TaskEntry" ADD COLUMN "visibility" "TaskEntryVisibility" NOT NULL DEFAULT 'OWNER_VISIBLE';
ALTER TABLE "TaskEntry" ALTER COLUMN "visibility" SET DEFAULT 'INTERNAL';
