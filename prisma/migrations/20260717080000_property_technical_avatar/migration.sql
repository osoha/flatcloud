-- FlatCloud Rent V13: technické údaje nemovitosti a avatary uživatelů.
-- Migrace je nedestruktivní a bezpečná i při opakovaném spuštění obnovy deploye.
ALTER TABLE "Property"
  ADD COLUMN IF NOT EXISTS "technicalData" JSONB;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "avatarData" BYTEA,
  ADD COLUMN IF NOT EXISTS "avatarMimeType" TEXT;
