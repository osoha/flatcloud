ALTER TABLE "User" ADD COLUMN "isTestIdentity" BOOLEAN NOT NULL DEFAULT false;

-- Only explicitly marked R24 fixtures; no inference from human names or roles.
UPDATE "User" SET "isTestIdentity" = true WHERE "title" = 'R24_AGENT_QA_2026_09';
