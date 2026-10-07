-- AlterTable
ALTER TABLE "OwnerBankAccount" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "usageState" TEXT NOT NULL DEFAULT 'AVAILABLE';

-- CreateTable
CREATE TABLE "BankAccountChange" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "failure" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "BankAccountChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccountChangeUnit" (
    "changeId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "expectedAccountId" TEXT,
    "expectedLeases" JSONB NOT NULL,

    CONSTRAINT "BankAccountChangeUnit_pkey" PRIMARY KEY ("changeId","unitId")
);

-- CreateTable
CREATE TABLE "LeaseReceiptAccount" (
    "leaseId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "variableSymbol" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaseReceiptAccount_pkey" PRIMARY KEY ("leaseId","accountId")
);

-- CreateTable
CREATE TABLE "BankAccountNotice" (
    "id" TEXT NOT NULL,
    "changeId" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'CHANGE',
    "snapshot" JSONB NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "pdfData" BYTEA NOT NULL,
    "pdfHash" TEXT NOT NULL,
    "tenantIds" TEXT[],
    "announcementId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankAccountNotice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccountNoticeRead" (
    "noticeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "BankAccountNoticeRead_pkey" PRIMARY KEY ("noticeId","userId")
);

-- CreateIndex
CREATE INDEX "BankAccountChange_status_effectiveAt_idx" ON "BankAccountChange"("status", "effectiveAt");

-- CreateIndex
CREATE INDEX "BankAccountChangeUnit_unitId_idx" ON "BankAccountChangeUnit"("unitId");

-- CreateIndex
CREATE INDEX "LeaseReceiptAccount_accountId_variableSymbol_idx" ON "LeaseReceiptAccount"("accountId", "variableSymbol");

-- CreateIndex
CREATE UNIQUE INDEX "BankAccountNotice_announcementId_key" ON "BankAccountNotice"("announcementId");

-- CreateIndex
CREATE INDEX "BankAccountNotice_leaseId_createdAt_idx" ON "BankAccountNotice"("leaseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BankAccountNotice_changeId_leaseId_kind_key" ON "BankAccountNotice"("changeId", "leaseId", "kind");

-- AddForeignKey
ALTER TABLE "BankAccountChange" ADD CONSTRAINT "BankAccountChange_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "OwnerBankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccountChangeUnit" ADD CONSTRAINT "BankAccountChangeUnit_changeId_fkey" FOREIGN KEY ("changeId") REFERENCES "BankAccountChange"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccountChangeUnit" ADD CONSTRAINT "BankAccountChangeUnit_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseReceiptAccount" ADD CONSTRAINT "LeaseReceiptAccount_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseReceiptAccount" ADD CONSTRAINT "LeaseReceiptAccount_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "OwnerBankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccountNotice" ADD CONSTRAINT "BankAccountNotice_changeId_fkey" FOREIGN KEY ("changeId") REFERENCES "BankAccountChange"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccountNotice" ADD CONSTRAINT "BankAccountNotice_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccountNoticeRead" ADD CONSTRAINT "BankAccountNoticeRead_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "BankAccountNotice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
