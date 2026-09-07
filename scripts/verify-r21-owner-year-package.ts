import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveAnnualOwnershipShare } from "../lib/reporting/annual-owner-package";

const read=(path:string)=>readFileSync(path,"utf8");let checks=0;
function check(name:string,run:()=>void){run();checks++;console.log(`✓ ${checks}. ${name}`)}

check("historical ownership resolution uses the interval effective on transaction date",()=>{
  const periods=[{ownerId:"a",shareBasisPoints:6000,validFrom:new Date("2025-01-01T12:00:00Z"),validTo:new Date("2025-06-30T12:00:00Z")},{ownerId:"b",shareBasisPoints:4000,validFrom:new Date("2025-01-01T12:00:00Z"),validTo:new Date("2025-06-30T12:00:00Z")}];
  assert.deepEqual(resolveAnnualOwnershipShare(periods,"a",new Date("2025-03-01T12:00:00Z"),10000),{shareBasisPoints:6000,complete:true,totalBasisPoints:10000});
});
check("incomplete ownership history falls back visibly instead of inventing a share",()=>{assert.deepEqual(resolveAnnualOwnershipShare([],"a",new Date("2025-03-01T12:00:00Z"),7500),{shareBasisPoints:7500,complete:false,totalBasisPoints:0})});
check("migration is additive and protects evidence invariants",()=>{const sql=read("prisma/migrations/20260907233000_annual_package_evidence/migration.sql");for(const marker of ["CREATE TABLE \"OwnershipPeriod\"","CREATE TABLE \"PropertyLoanAnnualEvidence\"","OwnershipPeriod_share_check","OwnershipPeriod_scope_check","PropertyLoanAnnualEvidence_interest_check"])assert.match(sql,new RegExp(marker));assert.doesNotMatch(sql,/DROP TABLE|DROP COLUMN|TRUNCATE/)});
check("annual interest is a separate reviewed record with optional source document",()=>{const schema=read("prisma/schema.prisma");for(const marker of ["model PropertyLoanAnnualEvidence","interestPaidCents BigInt","reviewStatus      AnnualReviewStatus","document          Document?"])assert.match(schema,new RegExp(marker.replace(/[?]/g,"\\?")))});
check("cost classification remains a human review state",()=>{const schema=read("prisma/schema.prisma"),route=read("app/api/reports/annual-owner-package/evidence/route.ts");assert.match(schema,/annualReviewStatus/);assert.match(route,/CONFIRMED_BY_ACCOUNTANT/);assert.doesNotMatch(route,/taxBase|deductible|daňový základ/i)});
check("evidence mutations require global access and are audited",()=>{const route=read("app/api/reports/annual-owner-package/evidence/route.ts");assert.match(route,/hasAllPropertyAccess\(user\)/);for(const action of ["ANNUAL_OWNERSHIP_PERIOD_CONFIRMED","ANNUAL_LOAN_INTEREST_EVIDENCE_UPDATED","ANNUAL_COST_REVIEW_UPDATED"])assert.match(route,new RegExp(action))});
check("an identical ownership submission is idempotent while a different overlap stays blocked",()=>{const route=read("app/api/reports/annual-owner-package/evidence/route.ts");assert.match(route,/repeatsSamePeriod/);assert.match(route,/overlap\.shareBasisPoints === shareBasisPoints/);assert.match(route,/Pro tohoto vlastníka už existuje překrývající se období/)});
check("closed annual package blocks incomplete ownership, cost review and interest evidence",()=>{const service=read("lib/reporting/annual-owner-package.ts");for(const marker of ["OWNERSHIP_HISTORY","COST_REVIEW","LOAN_INTEREST_SOURCE","range.closed ? \"BLOCKER\""])assert.match(service,new RegExp(marker.replace(/[?]/g,"\\?")))});
check("UI and CSV expose ownership history and reviewed evidence without claiming a tax return",()=>{const page=read("app/reporty/rocni-podklady/page.tsx"),csv=read("app/api/reports/annual-owner-package.csv/route.ts");for(const marker of ["Historická vlastnická struktura","Odborná kontrola","Upravit roční úrok","Nejde o automatické stanovení základu daně"])assert.match(page,new RegExp(marker));for(const marker of ["VLASTNICKÁ HISTORIE","Odborná kontrola","Stav kontroly","nejde o daňové přiznání"])assert.match(csv,new RegExp(marker,"i"))});
check("CSV export uses a file link without Next.js route prefetch",()=>{const page=read("app/reporty/rocni-podklady/page.tsx");assert.match(page,/<a className="primary" href=\{exportHref\}>/);assert.doesNotMatch(page,/<Link className="primary" href=\{exportHref\}>/)});
check("browser and CI gates cover R21",()=>{assert.match(read("e2e/flatcloud.smoke.spec.ts"),/R21 E2E potvrzený stav/);assert.match(read(".github/workflows/ci.yml"),/verify:r21-owner-year-package/)});
console.log(`R21 roční podklady ověřeny: ${checks} kontrol.`);
