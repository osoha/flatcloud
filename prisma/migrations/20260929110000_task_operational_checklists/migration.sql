CREATE TABLE "TaskChecklistItem" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "completedAt" TIMESTAMP(3),
  "completedById" TEXT,
  CONSTRAINT "TaskChecklistItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TaskChecklistItem_taskId_position_key" ON "TaskChecklistItem"("taskId", "position");
CREATE INDEX "TaskChecklistItem_taskId_completedAt_idx" ON "TaskChecklistItem"("taskId", "completedAt");
ALTER TABLE "TaskChecklistItem" ADD CONSTRAINT "TaskChecklistItem_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskChecklistItem" ADD CONSTRAINT "TaskChecklistItem_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
