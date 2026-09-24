-- Existing accounts get an optional introduction, never an unsolicited overlay.
ALTER TABLE "User"
  ADD COLUMN "onboardingStatus" TEXT NOT NULL DEFAULT 'available',
  ADD COLUMN "onboardingStep" TEXT NOT NULL DEFAULT 'welcome',
  ADD COLUMN "onboardingVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "onboardingRevision" INTEGER NOT NULL DEFAULT 0;
-- Public registration explicitly opts new owners into the introduction.
