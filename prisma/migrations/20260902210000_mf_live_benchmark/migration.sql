CREATE TYPE "UnitDisposition" AS ENUM (
  'STUDIO',
  'ONE_KK',
  'ONE_PLUS_ONE',
  'TWO_KK',
  'TWO_PLUS_ONE',
  'THREE_KK',
  'THREE_PLUS_ONE',
  'FOUR_KK',
  'FOUR_PLUS_ONE',
  'OTHER'
);

ALTER TABLE "Unit"
  ADD COLUMN "disposition" "UnitDisposition",
  ADD COLUMN "dispositionCustom" TEXT;
