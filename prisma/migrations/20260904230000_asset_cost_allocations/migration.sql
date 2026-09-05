-- CreateTable
CREATE TABLE "PropertyCostAllocation" (
    "id" TEXT NOT NULL,
    "propertyCostId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "shareBasisPoints" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertyCostAllocation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PropertyCostAllocation_shareBasisPoints_check" CHECK ("shareBasisPoints" BETWEEN 1 AND 10000),
    CONSTRAINT "PropertyCostAllocation_amountCents_check" CHECK ("amountCents" >= 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "PropertyCostAllocation_propertyCostId_unitId_key" ON "PropertyCostAllocation"("propertyCostId", "unitId");

-- CreateIndex
CREATE INDEX "PropertyCostAllocation_unitId_idx" ON "PropertyCostAllocation"("unitId");

-- AddForeignKey
ALTER TABLE "PropertyCostAllocation" ADD CONSTRAINT "PropertyCostAllocation_propertyCostId_fkey" FOREIGN KEY ("propertyCostId") REFERENCES "PropertyCost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyCostAllocation" ADD CONSTRAINT "PropertyCostAllocation_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill the explicit 100% split for costs already assigned to one unit.
INSERT INTO "PropertyCostAllocation" (
    "id",
    "propertyCostId",
    "unitId",
    "shareBasisPoints",
    "amountCents",
    "updatedAt"
)
SELECT
    'opening_' || "id",
    "id",
    "unitId",
    10000,
    "amountCents",
    CURRENT_TIMESTAMP
FROM "PropertyCost"
WHERE "unitId" IS NOT NULL;
