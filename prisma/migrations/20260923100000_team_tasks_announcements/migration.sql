-- P02: general team threads, personal task state, targeted announcements and automatic task settings.
ALTER TABLE "Task" ALTER COLUMN "propertyId" DROP NOT NULL;

CREATE TYPE "TaskMemberRole" AS ENUM ('COLLABORATOR', 'WATCHER');
CREATE TYPE "AnnouncementSeverity" AS ENUM ('INFO', 'IMPORTANT', 'CRITICAL');
CREATE TYPE "AnnouncementAudienceKind" AS ENUM ('ALL_USERS', 'FLATCLOUD_MEMBERS', 'ROLE', 'PROPERTY', 'USER');

CREATE TABLE "TaskMember" (
  "taskId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "TaskMemberRole" NOT NULL DEFAULT 'COLLABORATOR',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskMember_pkey" PRIMARY KEY ("taskId", "userId")
);

CREATE TABLE "TaskUserState" (
  "taskId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "favorite" BOOLEAN NOT NULL DEFAULT false,
  "dismissedAt" TIMESTAMP(3),
  "lastReadAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TaskUserState_pkey" PRIMARY KEY ("taskId", "userId")
);

CREATE TABLE "Announcement" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "severity" "AnnouncementSeverity" NOT NULL DEFAULT 'INFO',
  "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AnnouncementAudience" (
  "id" TEXT NOT NULL,
  "announcementId" TEXT NOT NULL,
  "kind" "AnnouncementAudienceKind" NOT NULL,
  "role" "UserRole",
  "propertyId" TEXT,
  "userId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnnouncementAudience_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AnnouncementUserState" (
  "announcementId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "dismissedAt" TIMESTAMP(3),
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AnnouncementUserState_pkey" PRIMARY KEY ("announcementId", "userId")
);

CREATE INDEX "TaskMember_userId_role_idx" ON "TaskMember"("userId", "role");
CREATE INDEX "TaskUserState_userId_favorite_dismissedAt_idx" ON "TaskUserState"("userId", "favorite", "dismissedAt");

CREATE TABLE "TaskAttachment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "taskEntryId" TEXT,
    "fileAssetId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskAttachment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TaskAttachment_fileAssetId_key" ON "TaskAttachment"("fileAssetId");
CREATE INDEX "TaskAttachment_taskId_createdAt_idx" ON "TaskAttachment"("taskId", "createdAt");
CREATE INDEX "TaskAttachment_taskEntryId_idx" ON "TaskAttachment"("taskEntryId");
ALTER TABLE "TaskAttachment" ADD CONSTRAINT "TaskAttachment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskAttachment" ADD CONSTRAINT "TaskAttachment_taskEntryId_fkey" FOREIGN KEY ("taskEntryId") REFERENCES "TaskEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskAttachment" ADD CONSTRAINT "TaskAttachment_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskAttachment" ADD CONSTRAINT "TaskAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Announcement_active_startsAt_expiresAt_idx" ON "Announcement"("active", "startsAt", "expiresAt");
CREATE INDEX "AnnouncementAudience_announcementId_kind_idx" ON "AnnouncementAudience"("announcementId", "kind");
CREATE INDEX "AnnouncementAudience_propertyId_idx" ON "AnnouncementAudience"("propertyId");
CREATE INDEX "AnnouncementAudience_userId_idx" ON "AnnouncementAudience"("userId");
CREATE INDEX "AnnouncementUserState_userId_dismissedAt_idx" ON "AnnouncementUserState"("userId", "dismissedAt");

ALTER TABLE "TaskMember" ADD CONSTRAINT "TaskMember_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskMember" ADD CONSTRAINT "TaskMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskUserState" ADD CONSTRAINT "TaskUserState_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskUserState" ADD CONSTRAINT "TaskUserState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AnnouncementAudience" ADD CONSTRAINT "AnnouncementAudience_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnnouncementAudience" ADD CONSTRAINT "AnnouncementAudience_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnnouncementAudience" ADD CONSTRAINT "AnnouncementAudience_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnnouncementUserState" ADD CONSTRAINT "AnnouncementUserState_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnnouncementUserState" ADD CONSTRAINT "AnnouncementUserState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TYPE "TaskAutomationEvent" AS ENUM ('PROPERTY_ONBOARDING', 'LEASE_START', 'LEASE_EXPIRY', 'LEASE_ANNIVERSARY', 'LEASE_TERMINATION', 'UNIT_HANDOVER_OUT', 'COST_DUE', 'BANK_UNMATCHED', 'COMPLIANCE_DUE', 'SUPPLIER_CONTRACT_DECISION');
CREATE TYPE "TaskAutomationOverrideMode" AS ENUM ('INHERIT', 'ENABLED', 'DISABLED');

CREATE TABLE "TaskAutomationRule" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "event" "TaskAutomationEvent" NOT NULL,
  "category" "TaskCategory" NOT NULL DEFAULT 'GENERAL',
  "priority" "TaskPriority" NOT NULL DEFAULT 'NORMAL',
  "leadDays" INTEGER NOT NULL DEFAULT 0,
  "globalEnabled" BOOLEAN NOT NULL DEFAULT true,
  "defaultEnabled" BOOLEAN NOT NULL DEFAULT true,
  "templateBody" TEXT NOT NULL,
  "checklist" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TaskAutomationRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TaskAutomationPropertySetting" (
  "ruleId" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "mode" "TaskAutomationOverrideMode" NOT NULL DEFAULT 'INHERIT',
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TaskAutomationPropertySetting_pkey" PRIMARY KEY ("ruleId", "propertyId")
);

CREATE UNIQUE INDEX "TaskAutomationRule_code_key" ON "TaskAutomationRule"("code");
CREATE INDEX "TaskAutomationRule_globalEnabled_event_idx" ON "TaskAutomationRule"("globalEnabled", "event");
CREATE INDEX "TaskAutomationPropertySetting_propertyId_mode_idx" ON "TaskAutomationPropertySetting"("propertyId", "mode");

ALTER TABLE "Task" ADD COLUMN "automationRuleId" TEXT;
ALTER TABLE "Task" ADD COLUMN "automationEventKey" TEXT;
CREATE INDEX "Task_automationRuleId_automationEventKey_idx" ON "Task"("automationRuleId", "automationEventKey");
ALTER TABLE "Task" ADD CONSTRAINT "Task_automationRuleId_fkey" FOREIGN KEY ("automationRuleId") REFERENCES "TaskAutomationRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TaskAutomationPropertySetting" ADD CONSTRAINT "TaskAutomationPropertySetting_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "TaskAutomationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskAutomationPropertySetting" ADD CONSTRAINT "TaskAutomationPropertySetting_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "TaskAutomationRule" ("id","code","name","description","event","category","priority","leadDays","globalEnabled","defaultEnabled","templateBody","checklist","updatedAt") VALUES
('auto_lease_expiry','LEASE_EXPIRY','Blížící se konec nájmu','Rozhodnutí o prodloužení, nových podmínkách nebo přeobsazení jednotky.','LEASE_EXPIRY','LEASE','HIGH',90,true,true,'Prověřte další postup nájmu, kontakt s nájemcem, nové podmínky a případnou přípravu distribuce.','["Rozhodnutí prodloužit nebo ukončit","Kontrola ceny a podmínek","Kontakt s nájemcem","Navazující kroky pro jednotku"]'::jsonb,CURRENT_TIMESTAMP),
('auto_lease_anniversary','LEASE_ANNIVERSARY','Výročí nájmu a indexace','Kontrola smluvní možnosti indexace a příprava návrhu bez automatické změny nájemného.','LEASE_ANNIVERSARY','LEASE','NORMAL',45,true,true,'Ověřte smluvní ujednání, dostupný index, aktuální nájemné a připravte návrh ke schválení.','["Smluvní podmínky","Aktuální index a benchmark","Návrh změny","Schválení a komunikace"]'::jsonb,CURRENT_TIMESTAMP),
('auto_lease_termination','LEASE_TERMINATION','Ukončení nájmu a převzetí bytu','Koordinace předání, odečtů, klíčů, stavu jednotky a vypořádání jistoty.','LEASE_TERMINATION','LEASE','HIGH',0,true,true,'Připravte převzetí jednotky, protokol, odečty, klíče, fotodokumentaci a podklady k vypořádání jistoty.','["Termín a předávací protokol","Odečty a klíče","Stav jednotky 1–5 a fotografie","Závady a opravy","Vypořádání jistoty"]'::jsonb,CURRENT_TIMESTAMP),
('auto_property_onboarding','PROPERTY_ONBOARDING','Převzetí nemovitosti do správy','Kontrola úplnosti provozních, finančních a právních podkladů nového objektu.','PROPERTY_ONBOARDING','GENERAL','NORMAL',0,false,true,'Doplňte vlastníky, jednotky, smlouvy, účty, pojištění, náklady, měřidla, dokumentaci a revize.',NULL,CURRENT_TIMESTAMP),
('auto_cost_due','COST_DUE','Splatnost neuhrazeného nákladu','Kontrola dokladu, schválení a skutečného zůstatku úhrad nákladu.','COST_DUE','GENERAL','HIGH',7,false,true,'Prověřte doklad, nákladové období, splatnost a zůstatek úhrad. Stav ACTUAL sám o sobě neznamená zaplaceno.',NULL,CURRENT_TIMESTAMP),
('auto_bank_unmatched','BANK_UNMATCHED','Nevyřešený bankovní pohyb','Dohledání protistrany, dokladu a správného přiřazení bankovní transakce.','BANK_UNMATCHED','GENERAL','NORMAL',2,false,true,'Zkontrolujte bankovní pohyb a přiřaďte jej ke správnému nájmu, nákladu, vratce nebo převodu.',NULL,CURRENT_TIMESTAMP),
('auto_compliance_due','COMPLIANCE_DUE','Revize nebo servis před termínem','Objednání kontroly, přístupu, protokolu a odstranění zjištěných závad.','COMPLIANCE_DUE','COMPLIANCE','HIGH',30,false,true,'Zajistěte termín, dodavatele, přístup, protokol a navazující odstranění závad.',NULL,CURRENT_TIMESTAMP),
('auto_supplier_contract','SUPPLIER_CONTRACT_DECISION','Rozhodný termín dodavatelské smlouvy','Konec fixace, výpovědní okno, prolongace nebo jiný termín pro energie a služby.','SUPPLIER_CONTRACT_DECISION','GENERAL','HIGH',120,false,true,'Prověřte cenu, produkt, odběrné místo, výpovědní lhůtu, prolongaci a dostupné nabídky. Úkol sám smlouvu nemění.',NULL,CURRENT_TIMESTAMP);
