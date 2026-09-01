CREATE TYPE "ReportDesignTemplateType" AS ENUM ('QUARTERLY_PROPERTY');
CREATE TYPE "ReportDesignTemplateVersionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');
CREATE TYPE "ReportDesignPageRole" AS ENUM ('COVER', 'OVERVIEW', 'TECHNICAL', 'VALUATION', 'TRENDS');
CREATE TYPE "ReportDesignBackgroundMode" AS ENUM ('GENERATED', 'ASSET');

CREATE TABLE "ReportDesignTemplate" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "ReportDesignTemplateType" NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReportDesignTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReportDesignTemplateVersion" (
  "id" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "ReportDesignTemplateVersionStatus" NOT NULL DEFAULT 'DRAFT',
  "config" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "activatedAt" TIMESTAMP(3),
  CONSTRAINT "ReportDesignTemplateVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReportDesignTemplatePage" (
  "id" TEXT NOT NULL,
  "templateVersionId" TEXT NOT NULL,
  "role" "ReportDesignPageRole" NOT NULL,
  "backgroundMode" "ReportDesignBackgroundMode" NOT NULL DEFAULT 'GENERATED',
  "backgroundAssetId" TEXT,
  "config" JSONB,
  CONSTRAINT "ReportDesignTemplatePage_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "QuarterlyReport" ADD COLUMN "designTemplateVersionId" TEXT;
CREATE UNIQUE INDEX "ReportDesignTemplate_code_key" ON "ReportDesignTemplate"("code");
CREATE UNIQUE INDEX "ReportDesignTemplateVersion_templateId_version_key" ON "ReportDesignTemplateVersion"("templateId", "version");
CREATE INDEX "ReportDesignTemplateVersion_templateId_status_idx" ON "ReportDesignTemplateVersion"("templateId", "status");
CREATE UNIQUE INDEX "ReportDesignTemplatePage_templateVersionId_role_key" ON "ReportDesignTemplatePage"("templateVersionId", "role");
CREATE INDEX "ReportDesignTemplatePage_backgroundAssetId_idx" ON "ReportDesignTemplatePage"("backgroundAssetId");
CREATE INDEX "QuarterlyReport_designTemplateVersionId_idx" ON "QuarterlyReport"("designTemplateVersionId");
ALTER TABLE "ReportDesignTemplateVersion" ADD CONSTRAINT "ReportDesignTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ReportDesignTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReportDesignTemplatePage" ADD CONSTRAINT "ReportDesignTemplatePage_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "ReportDesignTemplateVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReportDesignTemplatePage" ADD CONSTRAINT "ReportDesignTemplatePage_backgroundAssetId_fkey" FOREIGN KEY ("backgroundAssetId") REFERENCES "FileAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuarterlyReport" ADD CONSTRAINT "QuarterlyReport_designTemplateVersionId_fkey" FOREIGN KEY ("designTemplateVersionId") REFERENCES "ReportDesignTemplateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "ReportDesignTemplate" ("id", "code", "name", "type", "active", "createdAt", "updatedAt")
VALUES ('system-flatcloud-quarterly-2026', 'FLATCLOUD_QUARTERLY_2026', 'FlatCloud Quarterly 2026', 'QUARTERLY_PROPERTY', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "ReportDesignTemplateVersion" ("id", "templateId", "version", "status", "config", "createdAt", "activatedAt") VALUES (
  'system-flatcloud-quarterly-2026-v1',
  'system-flatcloud-quarterly-2026',
  1,
  'ACTIVE',
  '{"schemaVersion":1,"page":{"format":"A4","orientation":"LANDSCAPE"},"brand":{"primary":"#26639F","primaryDark":"#1E4F80","primaryLight":"#DDEAF5","text":"#1F2937","muted":"#7A7A7A","border":"#D7E1EA","white":"#FFFFFF"},"typography":{"display":"Raleway","heading":"Raleway","body":"Raleway","utility":"Arial"},"cover":{"preset":"FLATCLOUD_SPLIT_HERO","imageRect":{"x":0,"y":0,"width":0.472,"height":1},"brandRect":{"x":0.472,"y":0,"width":0.528,"height":1},"logoRect":{"x":0.715,"y":0.08,"width":0.225,"height":0.12},"titleRect":{"x":0.53,"y":0.38,"width":0.4,"height":0.12},"periodRect":{"x":0.53,"y":0.46,"width":0.35,"height":0.08}},"contentHeader":{"preset":"FLATCLOUD_DIAGONAL_HEADER","height":0.255,"darkPolygon":[[0,0],[0.79,0],[0.67,0.255],[0,0.255]],"lightPolygon":[[0.72,0],[1,0],[1,0.255],[0.67,0.255]],"reportLabelRect":{"x":0.035,"y":0.04,"width":0.45,"height":0.04},"propertyTitleRect":{"x":0.035,"y":0.085,"width":0.58,"height":0.08},"logoRect":{"x":0.715,"y":0.03,"width":0.225,"height":0.1}},"contentSafeArea":{"x":0.06,"y":0.31,"width":0.88,"height":0.6},"footer":{"x":0.035,"y":0.945,"width":0.93,"height":0.03},"mediaSlots":{"main":{"role":"PRIMARY","sortOrder":0,"fit":"COVER","focalPoint":"CENTER"},"supportive":{"role":"SECONDARY","sortOrder":0,"fit":"COVER","treatment":"AS_PROVIDED","blueVeilOpacity":0.16}},"pages":{"OVERVIEW":{"supportiveImageRect":{"x":0.06,"y":0.31,"width":0.52,"height":0.55},"commentaryRect":{"x":0.625,"y":0.34,"width":0.31,"height":0.5}},"TECHNICAL":{"bodyRect":{"x":0.06,"y":0.31,"width":0.88,"height":0.58}},"VALUATION":{"bodyRect":{"x":0.06,"y":0.31,"width":0.88,"height":0.58}},"TRENDS":{"bodyRect":{"x":0.06,"y":0.31,"width":0.88,"height":0.58}}}}'::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

INSERT INTO "ReportDesignTemplatePage" ("id", "templateVersionId", "role", "backgroundMode") VALUES
  ('system-flatcloud-quarterly-2026-v1-cover', 'system-flatcloud-quarterly-2026-v1', 'COVER', 'GENERATED'),
  ('system-flatcloud-quarterly-2026-v1-overview', 'system-flatcloud-quarterly-2026-v1', 'OVERVIEW', 'GENERATED'),
  ('system-flatcloud-quarterly-2026-v1-technical', 'system-flatcloud-quarterly-2026-v1', 'TECHNICAL', 'GENERATED'),
  ('system-flatcloud-quarterly-2026-v1-valuation', 'system-flatcloud-quarterly-2026-v1', 'VALUATION', 'GENERATED'),
  ('system-flatcloud-quarterly-2026-v1-trends', 'system-flatcloud-quarterly-2026-v1', 'TRENDS', 'GENERATED');
