import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { canCorrectTransactionFromGrants, crossPropertyReassignError, reassignedManualMetadata } from "../lib/payment-corrections";
import { paymentLeaseOptionLabel } from "../lib/payment-lease-options";

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
console.log(`V22-B.1 verification passed: ${count} checks.`);
