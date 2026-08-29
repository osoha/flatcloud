import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { applyPortfolioSelection, parsePortfolioSelection, portfolioSelectionLabel, serializePortfolioSelection, withPortfolioSelection } from "../lib/portfolio-selection";

const root=path.resolve(process.cwd()),read=(file:string)=>fs.readFileSync(path.join(root,file),"utf8");let count=0;
function check(name:string,fn:()=>unknown){fn();count++;console.log(`✓ ${count}. ${name}`)}
const ALL={mode:"ALL"} as const,scoped:{mode:"SCOPED";wholePropertyIds:string[];unitIds:string[]}={mode:"SCOPED",wholePropertyIds:["A"],unitIds:["B1"]};
check("no query means ALL",()=>assert.deepEqual(parsePortfolioSelection({}),ALL));
check("selected IDs dedupe",()=>assert.deepEqual(parsePortfolioSelection({properties:"B,A,B,,"}),{mode:"SELECTED",propertyIds:["A","B"]}));
check("legacy propertyId",()=>assert.deepEqual(parsePortfolioSelection({propertyId:"A"}),{mode:"SELECTED",propertyIds:["A"]}));
check("invalid explicit subset stays empty",()=>assert.deepEqual(parsePortfolioSelection({properties:",,"}),{mode:"SELECTED",propertyIds:[]}));
check("global selected becomes SCOPED",()=>assert.deepEqual(applyPortfolioSelection(ALL,{mode:"SELECTED",propertyIds:["B","A"]}),{mode:"SCOPED",wholePropertyIds:["A","B"],unitIds:[]}));
check("global without selection remains ALL",()=>assert.deepEqual(applyPortfolioSelection(ALL,ALL),ALL));
check("mixed property and unit grants",()=>assert.deepEqual(applyPortfolioSelection(scoped,{mode:"SELECTED",propertyIds:["A","B"]},{B1:"B"}),scoped));
check("unauthorized subset cannot expand",()=>assert.deepEqual(applyPortfolioSelection(scoped,{mode:"SELECTED",propertyIds:["C"]},{B1:"B"}),{mode:"SCOPED",wholePropertyIds:[],unitIds:[]}));
check("stable serialization",()=>assert.equal(serializePortfolioSelection({mode:"SELECTED",propertyIds:["B","A"]}),"A,B"));
check("ALL label",()=>assert.match(portfolioSelectionLabel(ALL,14,14),/Celé portfolio/));
check("selected label",()=>assert.match(portfolioSelectionLabel({mode:"SELECTED",propertyIds:["A"]},1,14),/1 z 14/));
check("query preservation",()=>assert.match(withPortfolioSelection("/reporty",new URLSearchParams("view=collections&x=1"),{mode:"SELECTED",propertyIds:["A"]}),/view=collections/));

const specs:Array<[string,string,string[]]>=[
  ["picker","components/PortfolioScopePicker.tsx",["router.push","Hledat nemovitost","type=\"checkbox\"","Vybrat vše","Použít výběr","Zrušit změny","Archivováno","aria-haspopup"]],
  ["portfolio","app/portfolio/page.tsx",["parsePortfolioSelection","selectedSet","selectedPropertyIds","taskScope","selection.mode===\"ALL\"","view=collections","PortfolioScopePicker","unmatchedCount"]],
  ["report","app/reporty/page.tsx",["Reporty","overview","occupancy","collections","tenancy","deposits","contracts","Datová kvalita","LIVE","properties","PortfolioScopePicker"]],
  ["live reporting","lib/reporting/live-service.ts",["businessDate","reportingPropertyAccessWhere","prisma.property.findMany","occupancyBps","weightedRentPerM2Cents","securityDepositSnapshot","leaseStatusAt","effectiveLeaseEnd","paidCentsAsOf","overdueDebtCentsAsOf","qualityIssues"]],
  ["legacy reports","app/reporty/[report]/page.tsx",["redirect","propertyId","predpisy","saldo","collections"]],
  ["download","app/api/documents/[id]/download/route.ts",["currentUser","requireDocumentAccess","document.fileAsset","getSignedDownloadUrl","300","getObject","private, no-store","attachment","inline","deletedAt"]],
  ["catalog","app/dokumenty/page.tsx",["documentAccessWhere","contains:q.q","propertyId:q.property","DocumentCategory","take:50","skip:","fileAsset:true","DocumentAttachments"]],
  ["upload API","app/api/documents/upload/route.ts",["currentUser","createDocumentFromUpload","prepareDocumentFiles","fileStorageCapabilities","Úložiště souborů není nakonfigurováno","propertyId","complianceRecordId"]],
  ["upload preparation","lib/documents/upload.ts",["MAX_DOCUMENT_FILES = 10","Promise.all","validateFile(file)","DocumentCategory.PHOTO","DocumentPhotoStage"]],
  ["document service","lib/documents/service.ts",["resolveAuthoritativeDocumentScope","requireDocumentCreateAccess","validateFile","DOCUMENT_UPLOADED","DOCUMENT_DELETED","Promise.allSettled","auditLog.create","softDeleteDocument"]],
  ["unit docs","app/nemovitosti/[id]/jednotky/[unitId]/page.tsx",["documentAccessWhere","Dokumenty jednotky","DocumentUploadForm","unitId={unitId}","HANDOVER_PROTOCOL"]],
  ["lease docs","app/smlouvy/[leaseId]/page.tsx",["documentAccessWhere","Dokumenty smlouvy","DocumentUploadForm","CONTRACT_ADDENDUM","canDelete={canEdit}"]],
  ["task create","app/api/tasks/route.ts",["prepareDocumentFiles","createDocumentFromUpload","DocumentPhotoStage.BEFORE","taskId:created.id"]],
  ["task thread","app/api/tasks/[id]/entries/route.ts",["prepareDocumentFiles","taskEntryId:entry.id","editableUnitWhere","createDocumentFromUpload"]],
  ["task close","app/api/tasks/[id]/close/route.ts",["kind:\"STATUS\"","DocumentPhotoStage.AFTER","status:\"DONE\"","TASK_CLOSED","Závěrečný komentář je povinný","editableUnitWhere"]],
  ["task UX","app/ukoly/[id]/page.tsx",["taskEntryId===entry.id","Fotodokumentace","Před opravou","Po opravě","Uzavřít případ","encType=\"multipart/form-data\""]],
  ["compliance","app/api/properties/[id]/compliance/[itemId]/complete/route.ts",["complianceRecordId:record.id","INSPECTION_PROTOCOL","prepareDocumentFiles","documentDate:performedAt"]],
  ["navigation","components/Shell.tsx",["href=\"/reporty\"","href=\"/dokumenty\"","href=\"/revize\"","href=\"/ukoly\"","Vlastníci a SPV"]],
  ["storage","lib/storage/index.ts",["fileStorageCapabilities","localStream","signedDownloads","DisabledStorage"]]
];
for(const[group,file,needles]of specs){const source=read(file);for(const needle of needles)check(`${group}: ${needle}`,()=>assert.ok(source.includes(needle),`${file} must contain ${needle}`))}
check("UI never exposes storageKey",()=>assert.doesNotMatch(read("components/documents/DocumentAttachments.tsx"),/storageKey/));
check("no V22-B migration",()=>assert.equal(fs.readdirSync(path.join(root,"prisma/migrations")).filter(name=>/v22.?b/i.test(name)).length,0));
assert.ok(count>=80);console.log(`V22-B verification passed: ${count} checks.`);
