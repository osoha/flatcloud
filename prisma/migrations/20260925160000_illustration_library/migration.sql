ALTER TABLE "User" ADD COLUMN "avatarChoice" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "avatarChoice" TEXT, ADD COLUMN "avatarData" BYTEA, ADD COLUMN "avatarMimeType" TEXT;
