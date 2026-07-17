-- V12 hotfix: pozvánky jsou v databázi uloženy v tabulce "UserInvitation".
-- Původní verze této migrace odkazovala na neexistující tabulku "Invitation"
-- a skončila v produkci chybou PostgreSQL 42P01.
-- Sloupec již přidává předchozí migrace 20260716180000_unit_level_access;
-- IF NOT EXISTS zachovává migraci bezpečnou a opakovatelnou pro všechny databáze.
ALTER TABLE "UserInvitation"
  ADD COLUMN IF NOT EXISTS "unitIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
