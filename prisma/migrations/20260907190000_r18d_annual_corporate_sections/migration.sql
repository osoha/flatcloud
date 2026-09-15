ALTER TABLE "AnnualReport"
  ADD COLUMN "teamSnapshot" JSONB,
  ADD COLUMN "groupStructureSnapshot" JSONB,
  ADD COLUMN "contactSnapshot" JSONB;

ALTER TABLE "AnnualPropertyReport"
  ADD COLUMN "mapLatitude" DOUBLE PRECISION,
  ADD COLUMN "mapLongitude" DOUBLE PRECISION,
  ADD COLUMN "mapLabel" TEXT,
  ADD COLUMN "mapCardSide" TEXT DEFAULT 'AUTO',
  ADD COLUMN "mapPhotoData" BYTEA,
  ADD COLUMN "mapPhotoMimeType" TEXT;
