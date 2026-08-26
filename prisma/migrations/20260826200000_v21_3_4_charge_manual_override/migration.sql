-- V21.3.4: preserve explicit monthly charge edits from automatic regeneration.
ALTER TABLE "Charge" ADD COLUMN IF NOT EXISTS "manualOverride" BOOLEAN NOT NULL DEFAULT false;
