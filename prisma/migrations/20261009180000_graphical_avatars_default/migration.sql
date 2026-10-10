-- Product default requested for every existing and future user.
-- Individual appearance preferences remain editable after this one-time reset.
ALTER TABLE "User" ALTER COLUMN "profiGraphics" SET DEFAULT true;
UPDATE "User" SET "profiGraphics" = true WHERE "profiGraphics" = false;
