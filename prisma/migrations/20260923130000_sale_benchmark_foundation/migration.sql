-- P02D: auditovatelné kvartální prodejní benchmarky bez automatického přepisu valuací.
ALTER TYPE "UnitValuationSource" ADD VALUE 'MARKET_BENCHMARK';

CREATE TYPE "SaleBenchmarkSource" AS ENUM ('SREALITY_PRICE_MAP', 'SREALITY_LISTINGS', 'MANUAL_REFERENCE');
CREATE TYPE "SaleBenchmarkMetric" AS ENUM ('REALIZED_AVERAGE', 'OFFER_MEDIAN');
CREATE TYPE "SaleBenchmarkConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW', 'INSUFFICIENT');
CREATE TYPE "SaleBenchmarkMappingQuality" AS ENUM ('EXACT', 'ONE_TO_MANY', 'APPROXIMATE', 'UNMAPPED');

CREATE TABLE "SaleBenchmarkSnapshot" (
  "id" TEXT NOT NULL,
  "source" "SaleBenchmarkSource" NOT NULL,
  "metric" "SaleBenchmarkMetric" NOT NULL,
  "sourceLocalityType" TEXT NOT NULL,
  "sourceLocalityId" TEXT NOT NULL,
  "sourceLocalityName" TEXT NOT NULL,
  "sourceSeoName" TEXT,
  "territoryCode" TEXT NOT NULL,
  "ruianCadastralCode" TEXT,
  "cadastralName" TEXT NOT NULL,
  "municipalityName" TEXT,
  "marketYear" INTEGER NOT NULL,
  "marketQuarter" INTEGER NOT NULL,
  "windowFrom" TIMESTAMP(3) NOT NULL,
  "windowTo" TIMESTAMP(3) NOT NULL,
  "pricePerSqmCents" BIGINT NOT NULL,
  "sampleCount" INTEGER NOT NULL,
  "confidence" "SaleBenchmarkConfidence" NOT NULL,
  "mappingQuality" "SaleBenchmarkMappingQuality" NOT NULL,
  "baselinePartial" BOOLEAN NOT NULL DEFAULT false,
  "acceptedSampleCount" INTEGER,
  "rejectedSampleCount" INTEGER NOT NULL DEFAULT 0,
  "rejectionSummary" JSONB,
  "sourceUrl" TEXT,
  "rawHash" TEXT NOT NULL,
  "parserVersion" TEXT NOT NULL,
  "methodVersion" TEXT NOT NULL,
  "retrievedAt" TIMESTAMP(3) NOT NULL,
  "importedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SaleBenchmarkSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SaleBenchmarkSnapshot_year_check" CHECK ("marketYear" >= 2020 AND "marketYear" <= 2200),
  CONSTRAINT "SaleBenchmarkSnapshot_quarter_check" CHECK ("marketQuarter" BETWEEN 1 AND 4),
  CONSTRAINT "SaleBenchmarkSnapshot_price_check" CHECK ("pricePerSqmCents" > 0),
  CONSTRAINT "SaleBenchmarkSnapshot_samples_check" CHECK ("sampleCount" > 0 AND "rejectedSampleCount" >= 0 AND ("acceptedSampleCount" IS NULL OR ("acceptedSampleCount" >= 0 AND "acceptedSampleCount" <= "sampleCount"))),
  CONSTRAINT "SaleBenchmarkSnapshot_window_check" CHECK ("windowTo" >= "windowFrom")
);

CREATE UNIQUE INDEX "SaleBenchmarkSnapshot_source_metric_sourceLocalityType_sourceLocalityId_territoryCode_marketYear_marketQuarter_key" ON "SaleBenchmarkSnapshot"("source", "metric", "sourceLocalityType", "sourceLocalityId", "territoryCode", "marketYear", "marketQuarter");
CREATE INDEX "SaleBenchmarkSnapshot_territoryCode_marketYear_marketQuarter_idx" ON "SaleBenchmarkSnapshot"("territoryCode", "marketYear", "marketQuarter");
CREATE INDEX "SaleBenchmarkSnapshot_source_metric_retrievedAt_idx" ON "SaleBenchmarkSnapshot"("source", "metric", "retrievedAt");
CREATE INDEX "SaleBenchmarkSnapshot_mappingQuality_confidence_idx" ON "SaleBenchmarkSnapshot"("mappingQuality", "confidence");
ALTER TABLE "SaleBenchmarkSnapshot" ADD CONSTRAINT "SaleBenchmarkSnapshot_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
