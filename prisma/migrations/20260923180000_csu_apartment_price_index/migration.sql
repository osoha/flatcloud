CREATE TABLE "CsuApartmentPriceIndex" (
  "id" TEXT NOT NULL,
  "territoryCode" TEXT NOT NULL,
  "marketYear" INTEGER NOT NULL,
  "marketQuarter" INTEGER NOT NULL,
  "indexBasisPoints" INTEGER NOT NULL,
  "sourceUpdatedAt" TIMESTAMP(3) NOT NULL,
  "sourceHash" TEXT NOT NULL,
  "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CsuApartmentPriceIndex_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CsuApartmentPriceIndex_valid" CHECK ("marketQuarter" BETWEEN 1 AND 4 AND "indexBasisPoints" > 0)
);

CREATE UNIQUE INDEX "CsuApartmentPriceIndex_territoryCode_marketYear_marketQuarter_key" ON "CsuApartmentPriceIndex"("territoryCode", "marketYear", "marketQuarter");
CREATE INDEX "CsuApartmentPriceIndex_marketYear_marketQuarter_idx" ON "CsuApartmentPriceIndex"("marketYear", "marketQuarter");

CREATE TABLE "CsuApartmentAverage" (
  "id" TEXT NOT NULL,
  "territoryCode" TEXT NOT NULL,
  "sourcePeriod" TEXT NOT NULL,
  "pricePerSqmCents" BIGINT NOT NULL,
  "sourceUpdatedAt" TIMESTAMP(3) NOT NULL,
  "sourceHash" TEXT NOT NULL,
  "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CsuApartmentAverage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CsuApartmentAverage_price_check" CHECK ("pricePerSqmCents" > 0)
);

CREATE UNIQUE INDEX "CsuApartmentAverage_territoryCode_sourcePeriod_key" ON "CsuApartmentAverage"("territoryCode", "sourcePeriod");
CREATE INDEX "CsuApartmentAverage_territoryCode_sourcePeriod_idx" ON "CsuApartmentAverage"("territoryCode", "sourcePeriod");
