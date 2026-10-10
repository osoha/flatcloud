-- CreateTable
CREATE TABLE "SubscriptionSetting" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionAccount" (
    "id" TEXT NOT NULL,
    "payerUserId" TEXT NOT NULL,
    "ownerId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'OWN',
    "billingName" TEXT NOT NULL,
    "billingEmail" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'FREE',
    "interval" TEXT NOT NULL DEFAULT 'MONTHLY',
    "contract" JSONB NOT NULL,
    "paidUntil" TIMESTAMP(3),
    "trialUntil" TIMESTAMP(3),
    "offerKind" TEXT NOT NULL DEFAULT 'NONE',
    "offerUntil" TIMESTAMP(3),
    "discountPercent" INTEGER NOT NULL DEFAULT 0,
    "fixedPriceCents" INTEGER,
    "featureOverrides" JSONB NOT NULL DEFAULT '{}',
    "overridesUntil" TIMESTAMP(3),
    "recurringConsent" BOOLEAN NOT NULL DEFAULT false,
    "simulationNow" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionScope" (
    "id" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "unitId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionPaymentRequest" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CZK',
    "recipientAccount" TEXT NOT NULL,
    "contractSnapshot" JSONB NOT NULL,
    "interval" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionPaymentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionPaymentEvent" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "recipientAccount" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "paymentStatus" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionPaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionAudit" (
    "id" TEXT NOT NULL,
    "accountId" TEXT,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubscriptionAccount_ownerId_idx" ON "SubscriptionAccount"("ownerId");

-- CreateIndex
CREATE INDEX "SubscriptionAccount_payerUserId_idx" ON "SubscriptionAccount"("payerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionScope_scopeKey_key" ON "SubscriptionScope"("scopeKey");

-- CreateIndex
CREATE INDEX "SubscriptionScope_accountId_idx" ON "SubscriptionScope"("accountId");

-- CreateIndex
CREATE INDEX "SubscriptionScope_propertyId_idx" ON "SubscriptionScope"("propertyId");

-- CreateIndex
CREATE INDEX "SubscriptionScope_unitId_idx" ON "SubscriptionScope"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPaymentRequest_reference_key" ON "SubscriptionPaymentRequest"("reference");

-- CreateIndex
CREATE INDEX "SubscriptionPaymentRequest_accountId_createdAt_idx" ON "SubscriptionPaymentRequest"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "SubscriptionPaymentEvent_requestId_idx" ON "SubscriptionPaymentEvent"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPaymentEvent_provider_providerEventId_key" ON "SubscriptionPaymentEvent"("provider", "providerEventId");

-- CreateIndex
CREATE INDEX "SubscriptionAudit_accountId_createdAt_idx" ON "SubscriptionAudit"("accountId", "createdAt");

-- AddForeignKey
ALTER TABLE "SubscriptionAccount" ADD CONSTRAINT "SubscriptionAccount_payerUserId_fkey" FOREIGN KEY ("payerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionAccount" ADD CONSTRAINT "SubscriptionAccount_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionScope" ADD CONSTRAINT "SubscriptionScope_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SubscriptionAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionScope" ADD CONSTRAINT "SubscriptionScope_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionScope" ADD CONSTRAINT "SubscriptionScope_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPaymentRequest" ADD CONSTRAINT "SubscriptionPaymentRequest_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SubscriptionAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPaymentEvent" ADD CONSTRAINT "SubscriptionPaymentEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "SubscriptionPaymentRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionAudit" ADD CONSTRAINT "SubscriptionAudit_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SubscriptionAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionAudit" ADD CONSTRAINT "SubscriptionAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

