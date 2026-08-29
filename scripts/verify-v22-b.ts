import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { applyPortfolioSelection, liveSelectedPropertyIds, parsePortfolioSelection, portfolioSelectionLabel, serializePortfolioSelection, withPortfolioSelection } from "../lib/portfolio-selection";
import { countNewLeasesYtd } from "../lib/reporting/live-service";
import { canEditTaskFromGrants, taskEditScope } from "../lib/task-access";
import { safeInternalReturnPath } from "../lib/route-response";
import { cleanDocumentCatalogParams, documentDateRange } from "../lib/documents/catalog";
import { expectedTransactionStatus, planOldestChargeAllocations } from "../lib/matching";
import { canCorrectTransactionFromGrants, manualCancellationError, uniqueAssignmentLeaseId } from "../lib/payment-corrections";

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
check("LIVE ALL excludes inactive",()=>assert.deepEqual(liveSelectedPropertyIds(ALL,[{id:"A",active:true},{id:"OLD",active:false}]),["A"]));
check("LIVE explicit inactive also excluded",()=>assert.deepEqual(liveSelectedPropertyIds({mode:"SELECTED",propertyIds:["OLD"]},[{id:"A",active:true},{id:"OLD",active:false}]),[]));
const ytdAsOf=new Date("2026-08-29T12:00:00Z");
check("ended-this-year lease counts as new YTD",()=>assert.equal(countNewLeasesYtd([{startDate:new Date("2026-01-02T12:00:00Z")}],ytdAsOf),1));
check("cancelled-before-start excluded from new YTD",()=>assert.equal(countNewLeasesYtd([{startDate:new Date("2026-02-02T12:00:00Z"),cancelledAt:new Date("2026-02-01T12:00:00Z")}],ytdAsOf),0));
check("future lease excluded from new YTD",()=>assert.equal(countNewLeasesYtd([{startDate:new Date("2026-09-01T12:00:00Z")}],ytdAsOf),0));
check("lease-scoped task uses lease unit",()=>assert.deepEqual(taskEditScope({propertyId:"A",unitId:null,lease:{unitId:"U"}}),{mode:"UNIT",propertyId:"A",unitId:"U"}));
check("unit editor can edit its unit task",()=>assert.equal(canEditTaskFromGrants({mode:"UNIT",propertyId:"A",unitId:"U"},{wholePropertyIds:[],unitIds:["U"]}),true));
check("unit editor cannot edit property task",()=>assert.equal(canEditTaskFromGrants({mode:"PROPERTY",propertyId:"A"},{wholePropertyIds:[],unitIds:["U"]}),false));
check("safe return rejects external URL",()=>assert.equal(safeInternalReturnPath("https://evil.example","/dokumenty"),"/dokumenty"));
check("safe return rejects protocol-relative URL",()=>assert.equal(safeInternalReturnPath("//evil.example","/dokumenty"),"/dokumenty"));
check("safe return accepts internal query",()=>assert.equal(safeInternalReturnPath("/dokumenty?x=1","/fallback"),"/dokumenty?x=1"));
check("catalog pagination omits undefined",()=>assert.equal(cleanDocumentCatalogParams({q:"nájem",property:undefined},2),"q=n%C3%A1jem&page=2"));
check("catalog pagination preserves real filters",()=>assert.match(cleanDocumentCatalogParams({category:"PHOTO",dateFrom:"2026-01-01"},3),/dateFrom=2026-01-01/));
check("document date range uses Prague boundaries",()=>{const range=documentDateRange({dateFrom:"2026-03-29",dateTo:"2026-03-29"});assert.equal(range.from?.toISOString(),"2026-03-28T23:00:00.000Z");assert.equal(range.to?.toISOString(),"2026-03-29T21:59:59.999Z")});
const emptyCharge={amountCents:10000,allocations:[],securityDepositOffsets:[],creditApplications:[]};
check("unallocate restores transaction remaining",()=>assert.deepEqual(expectedTransactionStatus({amountCents:10000,suggestedLeaseId:null,allocations:[],securityDepositReceipts:[]}),{status:"UNMATCHED",used:0,invalid:false}));
check("remaining rent allocation yields overpayment",()=>assert.equal(expectedTransactionStatus({amountCents:10000,suggestedLeaseId:null,allocations:[{amountCents:4000,charge:emptyCharge}],securityDepositReceipts:[]}).status,"OVERPAYMENT"));
check("deposit accounting use remains after rent unallocate",()=>assert.equal(expectedTransactionStatus({amountCents:10000,suggestedLeaseId:null,allocations:[],securityDepositReceipts:[{type:"RECEIVED",amountCents:3000}]}).used,3000));
check("reassign allocates oldest charge first",()=>assert.deepEqual(planOldestChargeAllocations([{chargeId:"old",outstandingCents:5000},{chargeId:"new",outstandingCents:5000}],7000).allocations,[{chargeId:"old",amountCents:5000},{chargeId:"new",amountCents:2000}]));
check("partial target debt leaves remaining",()=>assert.equal(planOldestChargeAllocations([{chargeId:"old",outstandingCents:2000}],7000).remainingCents,5000));
check("zero-outstanding charge is skipped",()=>assert.deepEqual(planOldestChargeAllocations([{chargeId:"paid",outstandingCents:0},{chargeId:"open",outstandingCents:1000}],1000).allocations,[{chargeId:"open",amountCents:1000}]));
check("single accounting lease retained as suggestion",()=>assert.equal(uniqueAssignmentLeaseId(["L","L"]),"L"));
check("multiple accounting leases clear suggestion",()=>assert.equal(uniqueAssignmentLeaseId(["L1","L2"]),null));
check("no accounting use clears suggestion",()=>assert.equal(uniqueAssignmentLeaseId([]),null));
check("property EDIT correction allowed",()=>assert.equal(canCorrectTransactionFromGrants("P",[],{wholePropertyIds:["P"],unitIds:[]}),true));
check("unit EDIT own allocation allowed",()=>assert.equal(canCorrectTransactionFromGrants("P",["U"],{wholePropertyIds:[],unitIds:["U"]}),true));
check("unit editor foreign allocation rejected",()=>assert.equal(canCorrectTransactionFromGrants("P",["U","FOREIGN"],{wholePropertyIds:[],unitIds:["U"]}),false));
check("VIEW cannot correct",()=>assert.equal(canCorrectTransactionFromGrants("P",["U"],{wholePropertyIds:[],unitIds:[]}),false));
check("bank import cannot be manually cancelled",()=>assert.match(manualCancellationError({source:"bank",status:"MATCHED",depositLinked:false})||"",/pouze ručně/));
check("deposit-linked manual cancellation blocked",()=>assert.match(manualCancellationError({source:"manual",status:"MATCHED",depositLinked:true})||"",/kauce/));
check("repeated manual cancellation controlled",()=>assert.match(manualCancellationError({source:"manual",status:"IGNORED",matchNote:"Ruční platba stornována správcem.",depositLinked:false})||"",/již byla stornována/));
check("eligible manual cancellation accepted",()=>assert.equal(manualCancellationError({source:"manual",status:"MATCHED",depositLinked:false}),null));

const specs:Array<[string,string,string[]]>=[
  ["picker","components/PortfolioScopePicker.tsx",["router.push","Hledat nemovitost","type=\"checkbox\"","Vybrat vše","Použít výběr","Zrušit změny","Archivováno","aria-haspopup","useEffect","setDraft(initial)"]],
  ["portfolio","app/portfolio/page.tsx",["parsePortfolioSelection","selectedSet","selectedPropertyIds","taskScope","selection.mode===\"ALL\"","view=collections","PortfolioScopePicker","unmatchedCount","prisma.task.count","prisma.complianceItem.count","taskCount","revisionCount","overdueRevisionCount","liveSelectedPropertyIds"]],
  ["report","app/reporty/page.tsx",["Reporty","overview","occupancy","collections","tenancy","deposits","contracts","Datová kvalita","LIVE","properties","PortfolioScopePicker"]],
  ["live reporting","lib/reporting/live-service.ts",["businessDate","reportingPropertyAccessWhere","prisma.property.findMany","occupancyBps","weightedRentPerM2Cents","securityDepositSnapshot","leaseStatusAt","effectiveLeaseEnd","paidCentsAsOf","overdueDebtCentsAsOf","qualityIssues"]],
  ["legacy reports","app/reporty/[report]/page.tsx",["redirect","propertyId","predpisy","saldo","collections"]],
  ["download","app/api/documents/[id]/download/route.ts",["currentUser","requireDocumentAccess","document.fileAsset","getSignedDownloadUrl","300","getObject","private, no-store","attachment","inline","deletedAt"]],
  ["catalog","app/dokumenty/page.tsx",["documentAccessWhere","contains:q.q","propertyId:q.property","DocumentCategory","take:50","skip:","fileAsset:true","DocumentAttachments","showContext","documentDate","dateFrom","dateTo","cleanDocumentCatalogParams"]],
  ["catalog context","components/documents/DocumentAttachments.tsx",["showContext","DocumentContext","Nemovitost","Jednotka","Smlouva","Úkol","Revize"]],
  ["upload API","app/api/documents/upload/route.ts",["currentUser","prepareDocumentFiles","prepareDocumentBatch","storePreparedDocumentBatch","createStoredDocumentsInTransaction","cleanupStoredDocumentBatch","safeInternalReturnPath","fileStorageCapabilities","Úložiště souborů není nakonfigurováno","propertyId","complianceRecordId"]],
  ["batch service","lib/documents/batch-service.ts",["prepareDocumentBatch","storePreparedDocumentBatch","createStoredDocumentsInTransaction","cleanupStoredDocumentBatch","Promise.allSettled","fileAsset.create","document.create","DOCUMENT_UPLOADED"]],
  ["upload preparation","lib/documents/upload.ts",["MAX_DOCUMENT_FILES = 10","Promise.all","validateFile(file)","DocumentCategory.PHOTO","DocumentPhotoStage"]],
  ["document service","lib/documents/service.ts",["resolveAuthoritativeDocumentScope","requireDocumentCreateAccess","validateFile","DOCUMENT_UPLOADED","DOCUMENT_DELETED","Promise.allSettled","auditLog.create","softDeleteDocument"]],
  ["unit docs","app/nemovitosti/[id]/jednotky/[unitId]/page.tsx",["documentAccessWhere","Dokumenty jednotky","DocumentUploadForm","unitId={unitId}","HANDOVER_PROTOCOL"]],
  ["lease docs","app/smlouvy/[leaseId]/page.tsx",["documentAccessWhere","Dokumenty smlouvy","DocumentUploadForm","CONTRACT_ADDENDUM","canDelete={canEdit}"]],
  ["task create","app/api/tasks/route.ts",["prepareDocumentFiles","storePreparedDocumentBatch","prisma.$transaction","tx.task.create","createStoredDocumentsInTransaction","cleanupStoredDocumentBatch","DocumentPhotoStage.BEFORE","TASK_CREATED"]],
  ["task thread","app/api/tasks/[id]/entries/route.ts",["prepareDocumentFiles","taskEntryId:entryId","canEditTask","tx.taskEntry.create","tx.task.update","tx.lease.update","createStoredDocumentsInTransaction","TASK_ENTRY_ADDED"]],
  ["task close","app/api/tasks/[id]/close/route.ts",["kind:\"STATUS\"","DocumentPhotoStage.AFTER","status:{notIn:[\"DONE\",\"CANCELLED\"]}","claim.count!==1","Úkol už byl mezitím uzavřen nebo zrušen","serializableTransaction","TASK_CLOSED","Závěrečný komentář je povinný","canEditTask"]],
  ["task edit","app/api/tasks/[id]/route.ts",["canEditTask","requestedStatus === \"DONE\"","pouze přes uzavření","task.status === \"DONE\" || task.status === \"CANCELLED\""]],
  ["task UX","app/ukoly/[id]/page.tsx",["taskEntryId===entry.id","Fotodokumentace","Před opravou","Po opravě","Uzavřít případ","encType=\"multipart/form-data\"","DONE\",\"CANCELLED","value===task.status:value!==\"DONE\""]],
  ["task access","lib/task-access.ts",["authoritativeTaskUnitId","taskEditScope","canEditTaskFromGrants","client.userProperty.findFirst","client.userUnit.findFirst"]],
  ["compliance","app/api/properties/[id]/compliance/[itemId]/complete/route.ts",["complianceRecordId:recordId","INSPECTION_PROTOCOL","prepareDocumentFiles","documentDate:performedAt","tx.complianceRecord.create","tx.complianceItem.update","createStoredDocumentsInTransaction","COMPLIANCE_COMPLETED"]],
  ["compliance UX","app/nemovitosti/[id]/[section]/page.tsx",["Revizní protokol","name=\"files\"","encType=\"multipart/form-data\""]],
  ["navigation","components/Shell.tsx",["href=\"/reporty\"","href=\"/dokumenty\"","href=\"/revize\"","href=\"/ukoly\"","Vlastníci a SPV"]],
  ["storage","lib/storage/index.ts",["fileStorageCapabilities","localStream","signedDownloads","DisabledStorage"]],
  ["S3 response metadata","lib/storage/s3.ts",["ResponseContentDisposition","ResponseContentType","expiresSeconds=300"]],
  ["safe returns","lib/route-response.ts",["safeInternalReturnPath","startsWith(\"/\")","startsWith(\"//\")"]],
  ["matching tx helpers","lib/matching.ts",["recomputeTransactionStatusTx","allocateAvailableTransactionToLeaseTx","planOldestChargeAllocations","orderBy: { dueDate: \"asc\" }","await recomputeTransactionStatusTx(tx,transactionId)"]],
  ["payment corrections","lib/payment-corrections.ts",["serializableTransaction","unallocatePayment","unallocateAllPayment","reassignPayment","cancelManualPayment","requireTransactionCorrectionAccess","canCorrectTransactionFromGrants","reconcileTransactionAssignmentMetadata","recomputeTransactionStatusTx","allocateAvailableTransactionToLeaseTx","paymentAllocation.delete","paymentAllocation.deleteMany","matchedRuleId:null","suggestedLeaseId:null","PAYMENT_UNALLOCATED","PAYMENT_UNALLOCATED_ALL","PAYMENT_REASSIGNED","MANUAL_PAYMENT_CANCELLED","previousAllocations","newAllocations","remainingCents","Platba již byla odpárována","Ruční platba již byla stornována","Cílový nájemní vztah nepatří do této nemovitosti","celou platbu nelze přepárovat","zaúčtována jako kauce"]],
  ["collection correction","lib/tasks.ts",["reconcileCollectionTasksAfterPaymentCorrectionTx","COLLECTION_TASK_RESOLVED","COLLECTION_TASK_REOPENED_AFTER_PAYMENT_CORRECTION","COLLECTION_TASK_CREATED_AFTER_PAYMENT_CORRECTION","TASK_CLOSED","TASK_UPDATED","latestClose?.action===\"COLLECTION_TASK_RESOLVED\"","status:\"IN_PROGRESS\"","closedAt:null","Obnovený dluh po opravě platby","if(open.length)continue","task.status === \"CANCELLED\") return task"]],
  ["single unallocate route","app/api/properties/[id]/transactions/[transactionId]/allocations/[allocationId]/remove/route.ts",["currentUser","unallocatePayment","allocationId","odpárováno"]],
  ["unallocate all route","app/api/properties/[id]/transactions/[transactionId]/unallocate-all/route.ts",["currentUser","unallocateAllPayment","zaúčtování kauce zůstalo beze změny"]],
  ["reassign route","app/api/properties/[id]/transactions/[transactionId]/reassign/route.ts",["currentUser","targetLeaseId","reassignPayment","přepárována"]],
  ["manual cancel route","app/api/properties/[id]/transactions/[transactionId]/cancel-manual/route.ts",["currentUser","cancelManualPayment","zůstává zachována v historii"]],
  ["payment correction UI","app/nemovitosti/[id]/platby/[transactionId]/page.tsx",["canCorrectTransaction","Odpárovat","Odpárovat všechna přiřazení nájemného","Přepárovat platbu","targetLeaseId","transaction.source===\"manual\"","Stornovat ruční platbu","Ruční platba byla stornována","depositLinked","celou platbu nelze přepárovat","Rozumím dopadu storna"]]
];
for(const[group,file,needles]of specs){const source=read(file);for(const needle of needles)check(`${group}: ${needle}`,()=>assert.ok(source.includes(needle),`${file} must contain ${needle}`))}
check("UI never exposes storageKey",()=>assert.doesNotMatch(read("components/documents/DocumentAttachments.tsx"),/storageKey/));
check("no V22-B migration",()=>assert.equal(fs.readdirSync(path.join(root,"prisma/migrations")).filter(name=>/v22.?b/i.test(name)).length,0));
check("manual cancellation never deletes BankTransaction",()=>assert.doesNotMatch(read("lib/payment-corrections.ts"),/bankTransaction\.delete/));
check("manual cancellation creates no ignore rule",()=>assert.doesNotMatch(read("lib/payment-corrections.ts"),/bankMatchingRule\.create/));
assert.ok(count>=260);console.log(`V22-B verification passed: ${count} checks.`);
