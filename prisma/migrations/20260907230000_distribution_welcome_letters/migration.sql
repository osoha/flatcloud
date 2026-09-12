CREATE TYPE "DistributionWelcomeLetterStatus" AS ENUM ('DRAFT', 'READY', 'SENDING', 'SENT', 'ARCHIVED');

CREATE TABLE "DistributionWelcomeLetter" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "sellerOwnerId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "status" "DistributionWelcomeLetterStatus" NOT NULL DEFAULT 'DRAFT',
    "templateVersion" TEXT NOT NULL DEFAULT 'flatcloud-welcome-v1',
    "recipientNameSnapshot" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "propertyNameSnapshot" TEXT NOT NULL,
    "propertyAddressSnapshot" TEXT NOT NULL,
    "unitLabelSnapshot" TEXT NOT NULL,
    "sellerNameSnapshot" TEXT NOT NULL,
    "ownershipRegisteredAt" TIMESTAMP(3) NOT NULL,
    "subject" TEXT NOT NULL,
    "introduction" TEXT NOT NULL,
    "handoverText" TEXT NOT NULL,
    "leaseText" TEXT NOT NULL,
    "insuranceText" TEXT NOT NULL,
    "managementText" TEXT NOT NULL,
    "platformText" TEXT NOT NULL,
    "taxText" TEXT NOT NULL,
    "associationText" TEXT NOT NULL,
    "closingText" TEXT NOT NULL,
    "contactText" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "readyById" TEXT,
    "readyAt" TIMESTAMP(3),
    "sendingStartedAt" TIMESTAMP(3),
    "sentById" TEXT,
    "sentAt" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DistributionWelcomeLetter_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DistributionWelcomeLetterAttachment" (
    "welcomeLetterId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DistributionWelcomeLetterAttachment_pkey" PRIMARY KEY ("welcomeLetterId", "documentId")
);

CREATE UNIQUE INDEX "DistributionWelcomeLetter_opportunityId_revision_key" ON "DistributionWelcomeLetter"("opportunityId", "revision");
CREATE INDEX "DistributionWelcomeLetter_propertyId_status_ownershipRegisteredAt_idx" ON "DistributionWelcomeLetter"("propertyId", "status", "ownershipRegisteredAt");
CREATE INDEX "DistributionWelcomeLetter_sellerOwnerId_idx" ON "DistributionWelcomeLetter"("sellerOwnerId");
CREATE INDEX "DistributionWelcomeLetterAttachment_documentId_idx" ON "DistributionWelcomeLetterAttachment"("documentId");

ALTER TABLE "DistributionWelcomeLetter" ADD CONSTRAINT "DistributionWelcomeLetter_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "DistributionOpportunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DistributionWelcomeLetter" ADD CONSTRAINT "DistributionWelcomeLetter_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DistributionWelcomeLetter" ADD CONSTRAINT "DistributionWelcomeLetter_sellerOwnerId_fkey" FOREIGN KEY ("sellerOwnerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DistributionWelcomeLetter" ADD CONSTRAINT "DistributionWelcomeLetter_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DistributionWelcomeLetter" ADD CONSTRAINT "DistributionWelcomeLetter_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DistributionWelcomeLetter" ADD CONSTRAINT "DistributionWelcomeLetter_readyById_fkey" FOREIGN KEY ("readyById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DistributionWelcomeLetter" ADD CONSTRAINT "DistributionWelcomeLetter_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DistributionWelcomeLetterAttachment" ADD CONSTRAINT "DistributionWelcomeLetterAttachment_welcomeLetterId_fkey" FOREIGN KEY ("welcomeLetterId") REFERENCES "DistributionWelcomeLetter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DistributionWelcomeLetterAttachment" ADD CONSTRAINT "DistributionWelcomeLetterAttachment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
