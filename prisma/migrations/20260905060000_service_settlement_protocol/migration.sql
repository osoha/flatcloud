CREATE TABLE "ServiceSettlementProtocol" (
    "id" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "periodFrom" TIMESTAMP(3) NOT NULL,
    "periodTo" TIMESTAMP(3) NOT NULL,
    "advancesCents" INTEGER NOT NULL,
    "actualCostsCents" INTEGER NOT NULL,
    "balanceCents" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3),
    "snapshot" JSONB NOT NULL,
    "chargeId" TEXT,
    "creditId" TEXT,
    "issuedById" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceSettlementProtocol_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ServiceSettlementProtocol_period_check" CHECK ("periodFrom" <= "periodTo"),
    CONSTRAINT "ServiceSettlementProtocol_amount_check" CHECK ("advancesCents" >= 0 AND "actualCostsCents" >= 0 AND "balanceCents" = "actualCostsCents" - "advancesCents"),
    CONSTRAINT "ServiceSettlementProtocol_financial_link_check" CHECK (
      ("balanceCents" > 0 AND "chargeId" IS NOT NULL AND "creditId" IS NULL AND "dueDate" IS NOT NULL) OR
      ("balanceCents" < 0 AND "chargeId" IS NULL AND "creditId" IS NOT NULL AND "dueDate" IS NULL) OR
      ("balanceCents" = 0 AND "chargeId" IS NULL AND "creditId" IS NULL AND "dueDate" IS NULL)
    )
);

CREATE UNIQUE INDEX "ServiceSettlementProtocol_chargeId_key" ON "ServiceSettlementProtocol"("chargeId");
CREATE UNIQUE INDEX "ServiceSettlementProtocol_creditId_key" ON "ServiceSettlementProtocol"("creditId");
CREATE UNIQUE INDEX "ServiceSettlementProtocol_leaseId_periodFrom_periodTo_key" ON "ServiceSettlementProtocol"("leaseId", "periodFrom", "periodTo");
CREATE INDEX "ServiceSettlementProtocol_leaseId_issuedAt_idx" ON "ServiceSettlementProtocol"("leaseId", "issuedAt");

ALTER TABLE "ServiceSettlementProtocol" ADD CONSTRAINT "ServiceSettlementProtocol_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServiceSettlementProtocol" ADD CONSTRAINT "ServiceSettlementProtocol_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "Charge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServiceSettlementProtocol" ADD CONSTRAINT "ServiceSettlementProtocol_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "LeaseCredit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServiceSettlementProtocol" ADD CONSTRAINT "ServiceSettlementProtocol_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION flatcloud_prevent_service_settlement_protocol_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Issued service settlement protocols are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ServiceSettlementProtocol_immutable" BEFORE UPDATE OR DELETE ON "ServiceSettlementProtocol" FOR EACH ROW EXECUTE FUNCTION flatcloud_prevent_service_settlement_protocol_mutation();
