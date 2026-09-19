CREATE TYPE "ServiceSettlementWorkflowStatus" AS ENUM ('WORKING','PAYMENT_CLOSED','APPROVED','DELIVERED','OBJECTION_OPEN','SETTLED');
CREATE TABLE "ServiceSettlementWorkflow" (
 "id" TEXT NOT NULL,"protocolId" TEXT NOT NULL,"status" "ServiceSettlementWorkflowStatus" NOT NULL DEFAULT 'WORKING',
 "paymentSnapshot" JSONB,"paymentClosedById" TEXT,"paymentClosedAt" TIMESTAMP(3),
 "approvedById" TEXT,"approvedAt" TIMESTAMP(3),"deliveredById" TEXT,"deliveredAt" TIMESTAMP(3),
 "deliveryMethod" TEXT,"deliveryReference" TEXT,"objectionUntil" TIMESTAMP(3),"objectionNote" TEXT,"objectionRaisedAt" TIMESTAMP(3),"objectionResolvedAt" TIMESTAMP(3),"objectionResolution" TEXT,
 "chargeId" TEXT,"creditId" TEXT,"settledById" TEXT,"settledAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "ServiceSettlementWorkflow_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ServiceSettlementWorkflow_protocolId_key" ON "ServiceSettlementWorkflow"("protocolId");
CREATE UNIQUE INDEX "ServiceSettlementWorkflow_chargeId_key" ON "ServiceSettlementWorkflow"("chargeId");
CREATE UNIQUE INDEX "ServiceSettlementWorkflow_creditId_key" ON "ServiceSettlementWorkflow"("creditId");
ALTER TABLE "ServiceSettlementWorkflow" ADD CONSTRAINT "ServiceSettlementWorkflow_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "ServiceSettlementProtocol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServiceSettlementWorkflow" ADD CONSTRAINT "ServiceSettlementWorkflow_paymentClosedById_fkey" FOREIGN KEY ("paymentClosedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServiceSettlementWorkflow" ADD CONSTRAINT "ServiceSettlementWorkflow_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServiceSettlementWorkflow" ADD CONSTRAINT "ServiceSettlementWorkflow_deliveredById_fkey" FOREIGN KEY ("deliveredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServiceSettlementWorkflow" ADD CONSTRAINT "ServiceSettlementWorkflow_settledById_fkey" FOREIGN KEY ("settledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServiceSettlementWorkflow" ADD CONSTRAINT "ServiceSettlementWorkflow_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "Charge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServiceSettlementWorkflow" ADD CONSTRAINT "ServiceSettlementWorkflow_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "LeaseCredit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
