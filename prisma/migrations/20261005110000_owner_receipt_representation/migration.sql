-- AlterTable
ALTER TABLE "TenantPaymentReceipt" ADD COLUMN     "issuanceMode" TEXT,
ADD COLUMN     "issuerOwnerId" TEXT,
ADD COLUMN     "representativeId" TEXT,
ADD COLUMN     "requestedById" TEXT;

-- CreateTable
CREATE TABLE "OwnerReceiptProfile" (
    "ownerId" TEXT NOT NULL,
    "issuerName" TEXT NOT NULL,
    "issuerAddress" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "designatedRepresentativeId" TEXT,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OwnerReceiptProfile_pkey" PRIMARY KEY ("ownerId")
);

-- CreateTable
CREATE TABLE "OwnerRepresentative" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleLabel" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "signatureData" BYTEA,
    "signatureHash" TEXT,
    "consentProfileRevision" INTEGER,
    "consentedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OwnerRepresentative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaseLandlordPeriod" (
    "id" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "fromPeriod" TEXT NOT NULL,
    "toPeriod" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "confirmedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaseLandlordPeriod_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LeaseLandlordPeriod_valid_month_range" CHECK ("fromPeriod" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND ("toPeriod" IS NULL OR ("toPeriod" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND "toPeriod" >= "fromPeriod")))
);

-- CreateIndex
CREATE UNIQUE INDEX "OwnerReceiptProfile_designatedRepresentativeId_key" ON "OwnerReceiptProfile"("designatedRepresentativeId");

-- CreateIndex
CREATE INDEX "OwnerRepresentative_userId_active_idx" ON "OwnerRepresentative"("userId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "OwnerRepresentative_ownerId_userId_key" ON "OwnerRepresentative"("ownerId", "userId");

-- CreateIndex
CREATE INDEX "LeaseLandlordPeriod_leaseId_active_fromPeriod_idx" ON "LeaseLandlordPeriod"("leaseId", "active", "fromPeriod");

-- CreateIndex
CREATE INDEX "LeaseLandlordPeriod_ownerId_idx" ON "LeaseLandlordPeriod"("ownerId");

-- AddForeignKey
ALTER TABLE "TenantPaymentReceipt" ADD CONSTRAINT "TenantPaymentReceipt_issuerOwnerId_fkey" FOREIGN KEY ("issuerOwnerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantPaymentReceipt" ADD CONSTRAINT "TenantPaymentReceipt_representativeId_fkey" FOREIGN KEY ("representativeId") REFERENCES "OwnerRepresentative"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerReceiptProfile" ADD CONSTRAINT "OwnerReceiptProfile_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerReceiptProfile" ADD CONSTRAINT "OwnerReceiptProfile_designatedRepresentativeId_fkey" FOREIGN KEY ("designatedRepresentativeId") REFERENCES "OwnerRepresentative"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerRepresentative" ADD CONSTRAINT "OwnerRepresentative_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerRepresentative" ADD CONSTRAINT "OwnerRepresentative_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseLandlordPeriod" ADD CONSTRAINT "LeaseLandlordPeriod_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseLandlordPeriod" ADD CONSTRAINT "LeaseLandlordPeriod_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
