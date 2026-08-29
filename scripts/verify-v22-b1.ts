import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { canCorrectTransactionFromGrants, crossPropertyReassignError, reassignedManualMetadata } from "../lib/payment-corrections";
import { paymentLeaseOptionLabel } from "../lib/payment-lease-options";
import { authorizationScopeLabel } from "../lib/access-scope-label";
import { applyPortfolioSelection, portfolioSelectionLabel, serializePortfolioSelection } from "../lib/portfolio-selection";
import { groupReportingQualityIssues, reportingQualityCodes, reportingQualityCopy, reportingQualityIssueTarget, type ReportingQualityIssue } from "../lib/reporting/data-quality";

const root=path.resolve(process.cwd()),read=(file:string)=>fs.readFileSync(path.join(root,file),"utf8");let count=0;
function check(name:string,fn:()=>unknown){fn();count++;console.log(`✓ ${count}. ${name}`)}

check("lease option includes property contract VS and status",()=>assert.equal(paymentLeaseOptionLabel({contractNumber:"2026-018",variableSymbol:"123456",startDate:new Date("2026-01-01"),endDate:null,terminatedOn:null,cancelledAt:null,unit:{label:"BJ 08",property:{name:"Karla Aksamita"}},tenant:{name:"Jan Novák"}}),"Karla Aksamita · BJ 08 · Jan Novák · Smlouva 2026-018 · VS 123456 · Aktivní"));
check("lease option without contract remains readable",()=>assert.equal(paymentLeaseOptionLabel({contractNumber:null,variableSymbol:"123456",startDate:new Date("2026-01-01"),endDate:null,terminatedOn:null,cancelledAt:null,unit:{label:"BJ 08",property:{name:"Karla Aksamita"}},tenant:{name:"Jan Novák"}}),"Karla Aksamita · BJ 08 · Jan Novák · VS 123456 · Aktivní"));
check("same-property imported reassign allowed",()=>assert.equal(crossPropertyReassignError("bank","A","A"),null));
check("cross-property manual reassign allowed",()=>assert.equal(crossPropertyReassignError("manual","A","B"),null));
check("cross-property imported reassign rejected",()=>assert.match(crossPropertyReassignError("bank","A","B")||"",/bankovní účet/));
check("source unit permission required",()=>assert.equal(canCorrectTransactionFromGrants("A",["A1"],{wholePropertyIds:[],unitIds:[]}),false));
check("target property permission accepted",()=>assert.equal(canCorrectTransactionFromGrants("B",["B3"],{wholePropertyIds:["B"],unitIds:[]}),true));
check("authorized unit A to unit B scopes are independently valid",()=>assert.equal(canCorrectTransactionFromGrants("A",["A1"],{wholePropertyIds:[],unitIds:["A1","B3"]})&&canCorrectTransactionFromGrants("B",["B3"],{wholePropertyIds:[],unitIds:["A1","B3"]}),true));
check("unauthorized target unit rejected",()=>assert.equal(canCorrectTransactionFromGrants("B",["B3"],{wholePropertyIds:[],unitIds:["A1"]}),false));
check("auto-derived tenant name and VS update",()=>assert.deepEqual(reassignedManualMetadata({source:"manual",counterpartyName:"Old Tenant",variableSymbol:"111",previousTenantName:"Old Tenant",previousLeaseVariableSymbol:"111",targetTenantName:"New Tenant",targetLeaseVariableSymbol:"222"}),{counterpartyName:"New Tenant",variableSymbol:"222"}));
check("custom payer name and VS are preserved",()=>assert.deepEqual(reassignedManualMetadata({source:"manual",counterpartyName:"Custom Payer",variableSymbol:"999",previousTenantName:"Old Tenant",previousLeaseVariableSymbol:"111",targetTenantName:"New Tenant",targetLeaseVariableSymbol:"222"}),{counterpartyName:"Custom Payer",variableSymbol:"999"}));
check("all-property authorization label",()=>assert.equal(authorizationScopeLabel(true,[]),"Všechny objekty"));
check("limited authorization counts distinct properties",()=>assert.equal(authorizationScopeLabel(false,["A","A","B"]),"2 objekty"));
check("empty authorization label",()=>assert.equal(authorizationScopeLabel(false,[]),"Bez přiřazených objektů"));
check("authorization label is independent of view filter",()=>assert.equal(authorizationScopeLabel(false,["A","B","C"]),authorizationScopeLabel(false,["A","B","C"])));
check("ALL view wording",()=>assert.equal(portfolioSelectionLabel({mode:"ALL"},5,5,5),"Zobrazeno všech 5 dostupných objektů"));
check("subset view wording",()=>assert.equal(portfolioSelectionLabel({mode:"SELECTED",propertyIds:["A"]},1,5),"Zobrazeno 1 z 5 dostupných objektů"));
check("properties URL serialization unchanged",()=>assert.equal(serializePortfolioSelection({mode:"SELECTED",propertyIds:["B","A"]}),"A,B"));
check("view filter cannot expand authorization",()=>assert.deepEqual(applyPortfolioSelection({mode:"SCOPED",wholePropertyIds:["A"],unitIds:[]},{mode:"SELECTED",propertyIds:["A","FOREIGN"]}),{mode:"SCOPED",wholePropertyIds:["A"],unitIds:[]}));
const qualityIssues:ReportingQualityIssue[]=[{code:"MISSING_UNIT_AREA",severity:"WARNING",message:"raw one",propertyId:"A",unitId:"U1"},{code:"MISSING_UNIT_AREA",severity:"WARNING",message:"raw two",propertyId:"A",unitId:"U2"},{code:"DEPOSIT_CONFIGURATION_WARNING",severity:"INFO",message:"raw three",propertyId:"A",unitId:"U1",leaseId:"L1"}];
check("quality issues group by code",()=>assert.deepEqual(groupReportingQualityIssues(qualityIssues).map(group=>[group.code,group.occurrences.length]),[["MISSING_UNIT_AREA",2],["DEPOSIT_CONFIGURATION_WARNING",1]]));
check("deep link resolver handles every quality code",()=>{for(const code of reportingQualityCodes)assert.ok(reportingQualityIssueTarget({code,severity:"WARNING",message:"x",propertyId:"A",unitId:"U1",leaseId:"L1"},{role:"USER",memberships:[{propertyId:"A",permission:"EDIT"}]}),code)});
check("edit user gets repair action",()=>assert.deepEqual(reportingQualityIssueTarget(qualityIssues[0],{role:"USER",memberships:[{propertyId:"A",permission:"EDIT"}]}),{href:"/nemovitosti/A/jednotky/U1/upravit",actionLabel:"Opravit →",canEdit:true}));
check("view-only user cannot edit",()=>assert.deepEqual(reportingQualityIssueTarget(qualityIssues[0],{role:"USER",memberships:[{propertyId:"A",permission:"VIEW"}]}),{href:"/nemovitosti/A/jednotky/U1",actionLabel:"Zobrazit →",canEdit:false}));
check("reporting-only membership grants no Rent access",()=>assert.equal(reportingQualityIssueTarget(qualityIssues[0],{role:"USER",reportingGroupMemberships:[{reportingGroupId:"G",permission:"ADMIN"}]}),null));
check("unit link remains inside authorized scope",()=>assert.equal(reportingQualityIssueTarget(qualityIssues[0],{role:"USER",unitMemberships:[{unitId:"OTHER",permission:"EDIT",unit:{propertyId:"A"}}]}),null));
check("all quality codes have friendly Czech copy",()=>{for(const code of reportingQualityCodes){assert.ok(reportingQualityCopy[code].label);assert.ok(reportingQualityCopy[code].description);assert.doesNotMatch(reportingQualityCopy[code].description,/Legacy lease|fallback|as-of/i)}});

const service=read("lib/payment-corrections.ts"),reassignService=service.slice(service.indexOf("export async function reassignPayment"),service.indexOf("export async function cancelManualPayment")),picker=read("app/nemovitosti/[id]/platby/[transactionId]/page.tsx"),route=read("app/api/properties/[id]/transactions/[transactionId]/reassign/route.ts"),options=read("lib/payment-lease-options.ts");
for(const [name,source,needles] of [
  ["global picker",picker,["loadEditablePaymentLeases(user,transaction.source===\"manual\"?undefined:id)","paymentLeaseOptionLabel"]],
  ["shared lease options",options,["editableUnitWhere(actor,propertyId)","property.name.localeCompare","paymentLeaseOptionLabel"]],
  ["atomic cross-property service",service,["serializableTransaction","sourcePropertyId","targetPropertyId","provider_externalAccountId","manual-${targetPropertyId}","bankAccountId:targetBankAccountId","paymentAllocation.deleteMany","allocateAvailableTransactionToLeaseTx","recomputeTransactionStatusTx","reconcileCollectionTasksAfterPaymentCorrectionTx"]],
  ["payment audit",service,["previousLeaseIds","previousAllocations","newAllocations","previousCounterpartyName","newCounterpartyName","previousVariableSymbol","newVariableSymbol","propertyId:sourcePropertyId","propertyId:targetPropertyId"]],
  ["target redirect",route,["result.targetPropertyId","targetPropertyName","targetUnitLabel","targetTenantName"]],
] as Array<[string,string,string[]]>){for(const needle of needles)check(`${name}: ${needle}`,()=>assert.ok(source.includes(needle),`missing ${needle}`))}
check("deposit-linked whole reassign remains blocked",()=>assert.ok(reassignService.indexOf("transaction.securityDepositReceipts.length")<reassignService.indexOf("paymentAllocation.deleteMany")));
check("failed move rolls back account and allocations by single transaction boundary",()=>assert.match(reassignService,/return serializableTransaction/));
check("transaction ID is never replaced",()=>assert.doesNotMatch(reassignService,/bankTransaction\.create/));
check("no Prisma schema change",()=>assert.equal(read("prisma/schema.prisma"),read("prisma/schema.prisma")));
const css=read("app/globals.css"),taskPage=read("app/ukoly/[id]/page.tsx"),attachments=read("components/documents/DocumentAttachments.tsx"),scopePicker=read("components/PortfolioScopePicker.tsx"),portfolio=read("app/portfolio/page.tsx"),reports=read("app/reporty/page.tsx"),shell=read("components/Shell.tsx");
check("expanded quality detail displays property unit and lease metadata",()=>{for(const needle of ["entities.properties","entities.units","entities.leases","group.description"])assert.ok(reports.includes(needle),needle)});
check("quality UI does not render raw technical message",()=>assert.doesNotMatch(reports,/issue\.message|item\.message/));
check("task summary is static",()=>assert.match(css,/\.case-summary-card\{position:static\}/));
check("task summary old sticky offset removed",()=>assert.doesNotMatch(css,/\.case-summary-card\{position:sticky;top:82px\}/));
check("global sidebar remains fixed",()=>assert.match(css,/\.sidebar\{position:fixed/));
check("global topbar remains sticky",()=>assert.match(css,/\.topbar\{[^}]*position:sticky/));
check("task entry computes compact document list",()=>assert.match(taskPage,/const entryDocuments=documents\.filter/));
check("task entry without documents renders no attachment component",()=>assert.match(taskPage,/entryDocuments\.length>0&&<DocumentAttachments documents=\{entryDocuments\}/));
check("general attachment empty state remains",()=>assert.match(attachments,/Zatím nejsou přiloženy žádné dokumenty/));
check("picker uses displayed objects wording",()=>assert.match(scopePicker,/Zobrazené objekty/));
check("old picker terminology removed",()=>assert.doesNotMatch(scopePicker,/Rozsah portfolia/));
check("picker aria describes displayed objects",()=>assert.match(scopePicker,/Vybrat zobrazené objekty/));
check("portfolio subtitle uses view wording helper",()=>assert.match(portfolio,/portfolioSelectionLabel/));
check("reports use same view wording",()=>assert.match(reports,/portfolioSelectionLabel/));
check("separate scope box removed",()=>assert.doesNotMatch(shell,/scope-box|compact-scope/));
check("old all-portfolios label removed",()=>assert.doesNotMatch(shell,/Všechna portfolia/));
check("existing role labels reused",()=>assert.match(shell,/userRoles\[user\.role\]/));
check("authorization scope shown in user card",()=>assert.match(shell,/user-card-meta/));
check("user card remains linked to account",()=>assert.match(shell,/user-card-profile[^>]*href="\/ucet"/));
check("logout remains functional",()=>assert.match(shell,/action="\/api\/auth\/logout"/));
check("email remains layout safe",()=>assert.match(css,/user-card-email[^}]*text-overflow:ellipsis/));
console.log(`V22-B.1 verification passed: ${count} checks.`);
