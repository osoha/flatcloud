import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { syncLeaseCharges, financialSyncFromPeriod, isMonthlyChargePeriod } from "../lib/charge-automation";
import { createOpeningBalance, OPENING_DEBT_DESCRIPTION, OPENING_OVERPAYMENT_DESCRIPTION, resolveLeaseFinancialOnboarding } from "../lib/lease-financial-onboarding";
import { calculatePropertySnapshot } from "../lib/reporting/snapshot-calculator";
import { outstandingCents } from "../lib/charges";
import { remainingCreditCents } from "../lib/credit";
import { leaseStatusAt } from "../lib/lease-lifecycle-core";

const root=path.resolve(process.cwd()),read=(file:string)=>fs.readFileSync(path.join(root,file),"utf8");let count=0;
function check(name:string,fn:()=>unknown|Promise<unknown>){return Promise.resolve().then(fn).then(()=>{count++;console.log(`✓ ${count}. ${name}`)})}
function form(values:Record<string,string>){const result=new FormData();for(const [key,value] of Object.entries(values))result.set(key,value);return result}
const august=new Date("2026-08-15T12:00:00Z");

async function main() {
await check("new lease starts financial tracking in its legal month",()=>assert.equal(resolveLeaseFinancialOnboarding(new Date("2026-08-01T12:00Z"),form({}),august).financialTrackingFromPeriod,"2026-08"));
await check("future lease keeps standard start-period behavior",()=>assert.deepEqual(resolveLeaseFinancialOnboarding(new Date("2026-10-01T12:00Z"),form({financialTrackingFromPeriod:"2026-08",openingBalanceType:"DEBT",openingBalanceAmount:"10"}),august),{historical:false,legalStartPeriod:"2026-10",financialTrackingFromPeriod:"2026-10",openingBalanceType:"ZERO",openingBalanceCents:0,openingBalanceNote:null,agreedDepositCents:0,openingDepositStatus:"NOT_FUNDED",openingDepositHeldCents:0}));
await check("historical ZERO defaults to current Prague business month",()=>assert.equal(resolveLeaseFinancialOnboarding(new Date("2022-06-01T12:00Z"),form({}),august).financialTrackingFromPeriod,"2026-08"));
await check("Prague month boundary controls onboarding default",()=>assert.equal(resolveLeaseFinancialOnboarding(new Date("2022-01-01T12:00Z"),form({}),new Date("2026-08-31T22:30:00Z")).financialTrackingFromPeriod,"2026-09"));
await check("sync cutover cannot be forced backwards",()=>assert.equal(financialSyncFromPeriod({financialTrackingFromPeriod:"2026-08"},"2022-06"),"2026-08"));

const charges:any[]=[];
const lease:any={id:"lease",financialTrackingFromPeriod:"2026-08",autoChargesEnabled:true,cancelledAt:null,startDate:new Date("2022-06-01T12:00Z"),endDate:new Date("2026-10-31T12:00Z"),terminatedOn:null,dueDay:5,rentTiming:"ADVANCE",paymentItems:[{id:"rent",name:"Nájemné",category:"RENT",amountCents:10000,active:true,validFrom:new Date("2022-06-01T12:00Z"),validTo:null,sortOrder:10,createdAt:new Date()}],charges};
const tx:any={lease:{findUnique:async()=>lease},charge:{create:async({data}:any)=>{const created={id:`c${charges.length+1}`,...data,items:data.items.create,allocations:[]};charges.push(created);return created},update:async({where,data}:any)=>{const charge=charges.find(row=>row.id===where.id);Object.assign(charge,data);return charge}}};
await check("historical sync creates no pre-cutover charges",async()=>{await syncLeaseCharges(tx,"lease",{now:august,force:true,fromPeriod:"2022-06"});assert.deepEqual(charges.map(row=>row.period),["2026-08","2026-09","2026-10"])});
await check("repeated automation never backfills pre-cutover",async()=>{await syncLeaseCharges(tx,"lease",{now:august,force:true,fromPeriod:"2022-06"});assert.equal(charges.length,3);assert.ok(charges.every(row=>row.period>="2026-08"))});
await check("explicit opening and settlement periods are outside monthly automation",()=>{assert.equal(isMonthlyChargePeriod("OPENING-2026-08-x"),false);assert.equal(isMonthlyChargePeriod("SETTLEMENT-2026-08-01-x"),false)});

const openingRecords:{charges:any[];credits:any[];bankTransactions:any[];allocations:any[]}={charges:[],credits:[],bankTransactions:[],allocations:[]};
const openingTx:any={charge:{create:async({data}:any)=>{const row={id:"opening-charge",...data,allocations:[],securityDepositOffsets:[],creditApplications:[]};openingRecords.charges.push(row);return row}},leaseCredit:{create:async({data}:any)=>{const row={id:"opening-credit",...data,applications:[]};openingRecords.credits.push(row);return row}}};
await check("opening debt creates exactly one explicit receivable",async()=>{const result=await createOpeningBalance(openingTx,{leaseId:"lease",dueDay:5,rentTiming:"ADVANCE",financialTrackingFromPeriod:"2026-08",type:"DEBT",amountCents:1250000,note:"Převzato od předchozího správce"});assert.equal(result.openingChargeId,"opening-charge");assert.equal(openingRecords.charges.length,1);assert.match(openingRecords.charges[0].note,new RegExp(OPENING_DEBT_DESCRIPTION));assert.equal(openingRecords.charges[0].items.create.category,"ADJUSTMENT")});
await check("opening debt enters standard outstanding",()=>assert.equal(outstandingCents(openingRecords.charges[0]),1250000));
await check("opening overpayment uses LeaseCredit without fake payment",async()=>{const result=await createOpeningBalance(openingTx,{leaseId:"lease",dueDay:5,rentTiming:"ADVANCE",financialTrackingFromPeriod:"2026-08",type:"OVERPAYMENT",amountCents:300000,note:null,createdById:"user"});assert.equal(result.openingCreditId,"opening-credit");assert.equal(openingRecords.credits[0].type,"OPENING_BALANCE");assert.equal(openingRecords.credits[0].description,OPENING_OVERPAYMENT_DESCRIPTION);assert.equal(openingRecords.bankTransactions.length,0);assert.equal(openingRecords.allocations.length,0)});
await check("opening overpayment uses standard application balance",()=>assert.equal(remainingCreditCents({...openingRecords.credits[0],applications:[{amountCents:125000}]}),175000));

const baseLease=(overrides:Record<string,unknown>={})=>({id:"lease",unitId:"unit",startDate:new Date("2022-06-01T12:00Z"),endDate:null,terminatedOn:null,cancelledAt:null,financialTrackingFromPeriod:"2026-08",rentCents:10000,servicesCents:1000,depositCents:0,paymentItems:[{active:true,validFrom:new Date("2022-06-01T12:00Z"),validTo:null,category:"RENT",amountCents:10000}],charges:[],securityDepositTerms:[],securityDepositMovements:[],...overrides});
const unit=(lease:any)=>({id:"unit",areaM2:50,operationalStatusEvents:[{status:"STANDARD",effectiveAt:new Date("2020-01-01T12:00Z")}],leases:[lease]});
await check("reporting before cutover has no false charge warning or debt",()=>{const snapshot=calculatePropertySnapshot({propertyId:"p",asOf:new Date("2026-07-15T12:00Z"),units:[unit(baseLease())]});assert.equal(snapshot.data.collections.overdueDebtCents,0);assert.equal(snapshot.data.rentRoll.monthlyNetRentCents,0);assert.ok(!snapshot.quality.issues.some(issue=>issue.code==="MISSING_CHARGE_FOR_PERIOD"))});
await check("reporting after cutover restores standard charge semantics",()=>{const snapshot=calculatePropertySnapshot({propertyId:"p",asOf:august,units:[unit(baseLease())]});assert.ok(snapshot.quality.issues.some(issue=>issue.code==="MISSING_CHARGE_FOR_PERIOD"));assert.equal(snapshot.data.rentRoll.monthlyNetRentCents,10000)});
await check("opening debt is overdue but not historical billed-rent KPI",()=>{const debt={...openingRecords.charges[0],active:true,dueDate:new Date("2026-08-05T12:00Z"),amountCents:1250000,period:"OPENING-2026-08-lease",items:[]};const snapshot=calculatePropertySnapshot({propertyId:"p",asOf:new Date("2026-08-20T12:00Z"),units:[unit(baseLease({charges:[debt]}))]});assert.equal(snapshot.data.collections.overdueDebtCents,1250000);assert.equal(snapshot.data.collections.quarterExpectedCents,0)});
await check("legal lifecycle remains anchored to original startDate",()=>assert.equal(leaseStatusAt(baseLease(),new Date("2023-01-01T12:00Z")),"ACTIVE"));
await check("notifications require an active property and real active charges",()=>{const notifications=read("lib/rent-notifications.ts"),tasks=read("lib/tasks.ts");assert.match(notifications,/where: \{ unit: \{ property: \{ active: true \} \}, charges: \{ some: \{ active: true \} \} \}/);assert.match(tasks,/overdueDebtCents\(charge\)/)});
await check("authorization remains existing property or unit edit scope",()=>{assert.match(read("app/api/properties/[id]/leases/route.ts"),/requireManagedProperty/);assert.match(read("app/api/properties/[id]/leases/[leaseId]/settlement\/route.ts"),/editableUnitWhere/);assert.doesNotMatch(read("lib/lease-financial-onboarding.ts"),/membership|permission|reportingGroup/)});
await check("audit records legal and financial onboarding provenance",()=>{const route=read("app/api/properties/[id]/leases/route.ts");for(const key of ["legalStartDate","financialTrackingFrom","openingBalanceType","openingBalanceCents","openingChargeId","openingCreditId"])assert.ok(route.includes(key),key)});
await check("schema is additive and exposes explicit provenance",()=>{const schema=read("prisma/schema.prisma"),migration=read("prisma/migrations/20260829120000_v22_c_historical_lease_financial_onboarding/migration.sql");assert.match(schema,/financialTrackingFromPeriod\s+String/);assert.match(schema,/OPENING_BALANCE/);assert.doesNotMatch(migration,/DROP|DELETE|TRUNCATE/i)});
await check("no fake payment history is created",()=>{const source=read("lib/lease-financial-onboarding.ts");assert.doesNotMatch(source,/bankTransaction|paymentAllocation/i)});
console.log(`V22-C Part 1 verification passed: ${count} checks.`);
}
main().catch((error)=>{console.error(error);process.exit(1)});
