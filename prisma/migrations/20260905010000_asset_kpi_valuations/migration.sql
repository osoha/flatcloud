-- CreateEnum
CREATE TYPE "PropertyValuationSource" AS ENUM ('PURCHASE_PRICE', 'INTERNAL', 'EXTERNAL');

-- CreateTable
CREATE TABLE "PropertyValuationSnapshot" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "asOfDate" TIMESTAMP(3) NOT NULL,
    "marketValueCents" INTEGER NOT NULL,
    "source" "PropertyValuationSource" NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PropertyValuationSnapshot_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PropertyValuationSnapshot_marketValueCents_check" CHECK ("marketValueCents" > 0)
);

-- CreateIndex
CREATE INDEX "PropertyValuationSnapshot_propertyId_asOfDate_idx" ON "PropertyValuationSnapshot"("propertyId", "asOfDate");

-- AddForeignKey
ALTER TABLE "PropertyValuationSnapshot" ADD CONSTRAINT "PropertyValuationSnapshot_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyValuationSnapshot" ADD CONSTRAINT "PropertyValuationSnapshot_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
