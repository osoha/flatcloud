ALTER TABLE "AppSetting" ADD COLUMN "mfRentLastCheckedAt" TIMESTAMP(3), ADD COLUMN "mfRentLastSuccessAt" TIMESTAMP(3), ADD COLUMN "mfRentLastSummary" TEXT;

CREATE TABLE "MfRentDatasetRelease" (
  "id" TEXT NOT NULL, "sourceUrl" TEXT NOT NULL, "sourceSha256" TEXT NOT NULL, "sourceFileName" TEXT NOT NULL,
  "publishedOn" TIMESTAMP(3) NOT NULL, "marketYear" INTEGER NOT NULL, "marketQuarter" INTEGER NOT NULL,
  "parserVersion" TEXT NOT NULL, "schemaFingerprint" TEXT NOT NULL, "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "importedById" TEXT, CONSTRAINT "MfRentDatasetRelease_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MfRentDatasetRelease_sourceSha256_key" ON "MfRentDatasetRelease"("sourceSha256");
CREATE INDEX "MfRentDatasetRelease_marketYear_marketQuarter_idx" ON "MfRentDatasetRelease"("marketYear", "marketQuarter");
CREATE INDEX "MfRentDatasetRelease_publishedOn_idx" ON "MfRentDatasetRelease"("publishedOn");

CREATE TABLE "MfRentTerritorySnapshot" (
  "id" TEXT NOT NULL, "releaseId" TEXT NOT NULL, "territoryCode" TEXT NOT NULL, "territoryName" TEXT NOT NULL,
  "municipalityName" TEXT, "districtName" TEXT, "regionName" TEXT, "data" JSONB NOT NULL,
  CONSTRAINT "MfRentTerritorySnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MfRentTerritorySnapshot_releaseId_territoryCode_key" ON "MfRentTerritorySnapshot"("releaseId", "territoryCode");
CREATE INDEX "MfRentTerritorySnapshot_territoryCode_idx" ON "MfRentTerritorySnapshot"("territoryCode");
CREATE INDEX "MfRentTerritorySnapshot_releaseId_idx" ON "MfRentTerritorySnapshot"("releaseId");
CREATE INDEX "MfRentTerritorySnapshot_municipalityName_idx" ON "MfRentTerritorySnapshot"("municipalityName");

CREATE TABLE "PropertyMfRentLocation" (
  "propertyId" TEXT NOT NULL, "territoryCode" TEXT NOT NULL, "territoryName" TEXT NOT NULL, "municipalityName" TEXT,
  "confirmedById" TEXT NOT NULL, "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PropertyMfRentLocation_pkey" PRIMARY KEY ("propertyId")
);
CREATE INDEX "PropertyMfRentLocation_territoryCode_idx" ON "PropertyMfRentLocation"("territoryCode");
ALTER TABLE "MfRentDatasetRelease" ADD CONSTRAINT "MfRentDatasetRelease_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MfRentTerritorySnapshot" ADD CONSTRAINT "MfRentTerritorySnapshot_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "MfRentDatasetRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PropertyMfRentLocation" ADD CONSTRAINT "PropertyMfRentLocation_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PropertyMfRentLocation" ADD CONSTRAINT "PropertyMfRentLocation_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "preventMfRentImportedRowMutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Imported MF rent rows are immutable';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "MfRentDatasetRelease_immutable" BEFORE UPDATE OR DELETE ON "MfRentDatasetRelease" FOR EACH ROW EXECUTE FUNCTION "preventMfRentImportedRowMutation"();
CREATE TRIGGER "MfRentTerritorySnapshot_immutable" BEFORE UPDATE OR DELETE ON "MfRentTerritorySnapshot" FOR EACH ROW EXECUTE FUNCTION "preventMfRentImportedRowMutation"();
