import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { crossPropertyReassignError } from "../lib/payment-corrections";
import { paymentReassignmentEligible } from "../lib/payment-lease-options";

const read=(path:string)=>readFileSync(path,"utf8");let passed=0;
function check(name:string,run:()=>void){run();passed+=1;console.log(`✓ ${name}`)}
const now=new Date("2026-09-06T12:00:00Z"),ended={startDate:new Date("2025-01-01T12:00:00Z"),endDate:new Date("2025-12-31T12:00:00Z"),terminatedOn:null,cancelledAt:null};

check("cross-property payment correction is blocked for every source",()=>{assert.match(crossPropertyReassignError("manual","A","B")||"",/nelze přesunout/);assert.match(crossPropertyReassignError("email","A","B")||"",/nelze přesunout/);assert.equal(crossPropertyReassignError("manual","A","A"),null)});
check("ended relationship without debt is not a correction target",()=>assert.equal(paymentReassignmentEligible({...ended,charges:[]},now),false));
check("ended relationship with open debt remains a valid target",()=>assert.equal(paymentReassignmentEligible({...ended,charges:[{active:true,amountCents:20_000,allocations:[]}]},now),true));
check("reassign picker and server share scope and eligibility",()=>{const page=read("app/nemovitosti/[id]/platby/[transactionId]/page.tsx"),service=read("lib/payment-corrections.ts"),route=read("app/api/properties/[id]/transactions/[transactionId]/reassign/route.ts");assert.match(page,/loadEditablePaymentLeases\(user,id\)/);assert.match(page,/paymentReassignmentEligible/);assert.match(service,/propertyId:sourcePropertyId/);assert.match(service,/paymentReassignmentEligible\(target\)/);assert.match(route,/confirmReassign/)});
check("both manual payment entry points are idempotent",()=>{for(const path of ["app/api/payments/manual/route.ts","app/api/properties/[id]/payments/manual/route.ts"]){const source=read(path);assert.match(source,/idempotencyKey/);assert.match(source,/P2002/);assert.match(source,/opakovaný požadavek nevytvořil duplikát/)}const page=read("app/nemovitosti/[id]/platby/nova/page.tsx");assert.match(page,/RecoverableMutationForm/);assert.match(page,/idempotencyFieldName="idempotencyKey"/)});
check("advanced rule has no destructive default and needs a predicate",()=>{const page=read("app/nemovitosti/[id]/[section]/page.tsx"),route=read("app/api/properties/[id]/matching-rules/route.ts");assert.match(page,/defaultValue="" required><option value="">Vyberte akci/);assert.match(page,/Ignorovat jako nesledovaný pohyb/);assert.match(route,/Object\.values\(MatchRuleAction\)/);assert.match(route,/alespoň jednu podmínku/)});

console.log(`R10B verifier passed (${passed} checks).`);
