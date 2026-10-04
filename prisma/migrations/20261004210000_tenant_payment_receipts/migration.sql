ALTER TABLE "User" ADD COLUMN "receiptSignatureData" BYTEA,
ADD COLUMN "receiptIssuerName" TEXT,
ADD COLUMN "receiptIssuerAddress" TEXT,
ADD COLUMN "receiptIssuanceEnabled" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "TenantPaymentReceipt" (
"id" TEXT NOT NULL, "chargeId" TEXT NOT NULL, "issuerId" TEXT NOT NULL,
"snapshotHash" TEXT NOT NULL, "snapshot" JSONB NOT NULL, "pdfData" BYTEA NOT NULL,
"issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
CONSTRAINT "TenantPaymentReceipt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TenantPaymentReceipt_chargeId_snapshotHash_key" ON "TenantPaymentReceipt"("chargeId", "snapshotHash");
CREATE INDEX "TenantPaymentReceipt_issuerId_idx" ON "TenantPaymentReceipt"("issuerId");
ALTER TABLE "TenantPaymentReceipt" ADD CONSTRAINT "TenantPaymentReceipt_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "Charge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TenantPaymentReceipt" ADD CONSTRAINT "TenantPaymentReceipt_issuerId_fkey" FOREIGN KEY ("issuerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
