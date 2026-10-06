-- AlterTable
ALTER TABLE "Owner" ADD COLUMN     "dateOfBirth" DATE,
ADD COLUMN     "legalRegistry" TEXT;

-- AlterTable
ALTER TABLE "Lease" ADD COLUMN     "documentOrigin" TEXT;

-- CreateTable
CREATE TABLE "ContractSignatureProfile" (
    "userId" TEXT NOT NULL,
    "encryptedImage" TEXT NOT NULL,
    "imageHash" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractSignatureProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "LeaseActionPacket" (
    "id" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "documentId" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "sourceFileHash" TEXT,
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "LeaseActionPacket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaseActionRecipient" (
    "id" TEXT NOT NULL,
    "packetId" TEXT NOT NULL,
    "participantKey" TEXT NOT NULL,
    "tenantId" TEXT,
    "staffUserId" TEXT,
    "expectedName" TEXT NOT NULL,
    "signerAuthority" TEXT,
    "openedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "completedByName" TEXT,
    "completedByEmail" TEXT,
    "signatureEncrypted" TEXT,
    "signatureHash" TEXT,
    "evidenceHash" TEXT,

    CONSTRAINT "LeaseActionRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeaseActionPacket_leaseId_createdAt_idx" ON "LeaseActionPacket"("leaseId", "createdAt");

-- CreateIndex
CREATE INDEX "LeaseActionPacket_dueAt_cancelledAt_idx" ON "LeaseActionPacket"("dueAt", "cancelledAt");

-- CreateIndex
CREATE INDEX "LeaseActionRecipient_tenantId_completedAt_idx" ON "LeaseActionRecipient"("tenantId", "completedAt");

-- CreateIndex
CREATE INDEX "LeaseActionRecipient_staffUserId_completedAt_idx" ON "LeaseActionRecipient"("staffUserId", "completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LeaseActionRecipient_packetId_participantKey_key" ON "LeaseActionRecipient"("packetId", "participantKey");

-- AddForeignKey
ALTER TABLE "ContractSignatureProfile" ADD CONSTRAINT "ContractSignatureProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseActionPacket" ADD CONSTRAINT "LeaseActionPacket_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseActionPacket" ADD CONSTRAINT "LeaseActionPacket_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseActionRecipient" ADD CONSTRAINT "LeaseActionRecipient_packetId_fkey" FOREIGN KEY ("packetId") REFERENCES "LeaseActionPacket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

