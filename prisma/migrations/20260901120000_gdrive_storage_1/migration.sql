ALTER TABLE "Property" ADD COLUMN "googleDriveFolderId" TEXT;
CREATE UNIQUE INDEX "Property_googleDriveFolderId_key" ON "Property"("googleDriveFolderId");
