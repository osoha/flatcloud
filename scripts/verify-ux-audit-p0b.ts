import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assertAssetDateNotFuture, calculateAssetFinanceSummary } from "../lib/asset-finance";

const read=(path:string)=>readFileSync(path,"utf8"); let checks=0;
function check(name:string,run:()=>void){run();checks+=1;console.log(`✓ ${checks}. ${name}`)}

check("ordinary institutional loan balances fit the model",()=>{
  const schema=read("prisma/schema.prisma"),migration=read("prisma/migrations/20260905095000_large_loans/migration.sql");
  for(const field of ["principalCents            BigInt","outstandingPrincipalCents BigInt","monthlyDebtServiceCents   BigInt?"])assert.match(schema,new RegExp(field.replace("?","\\?")));
  assert.match(migration,/ALTER COLUMN "principalCents" TYPE BIGINT/);
  assert.match(migration,/ALTER COLUMN "outstandingPrincipalCents" TYPE BIGINT/);
  assert.doesNotMatch(migration,/DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM/);
  const summary=calculateAssetFinanceSummary([], [{active:true,outstandingPrincipalCents:BigInt(6_000_000_000),monthlyDebtServiceCents:BigInt(350_000_00)}],2026);
  assert.equal(summary.outstandingPrincipalCents,6_000_000_000);
});

check("confirmed finance history rejects future dates",()=>{
  const now=new Date("2026-09-05T08:00:00Z");
  assert.equal(assertAssetDateNotFuture(new Date("2026-09-05T12:00:00Z"),now).toISOString(),"2026-09-05T12:00:00.000Z");
  assert.throws(()=>assertAssetDateNotFuture(new Date("2026-09-06T12:00:00Z"),now),/budoucnosti/);
  for(const route of ["app/api/properties/[id]/loans/route.ts","app/api/properties/[id]/loans/[loanId]/snapshots/route.ts","app/api/properties/[id]/valuations/route.ts"])assert.match(read(route),/assertAssetDateNotFuture/);
});

check("LIVE asset report uses business-day end and dated loan snapshots",()=>{
  const source=read("lib/reporting/asset-finance-kpis.ts");
  assert.match(source,/businessDateEndInstant\(businessDateKey\(asOf\)\)/);
  assert.match(source,/snapshots: \{ where: \{ asOfDate: \{ lte: asOfEnd \} \}/);
  assert.match(source,/loan\.snapshots\.length/);
  assert.doesNotMatch(source,/select: \{ id: true, propertyId: true, label: true, rateType: true, fixedUntil: true, outstandingPrincipalCents/);
});

check("same-day valuation is included and annual history has no current-card fallback",()=>{
  const kpis=read("lib/reporting/asset-finance-kpis.ts"),annual=read("lib/reporting/annual-owner-package.ts");
  assert.match(kpis,/asOfDate: \{ lte: asOfEnd \}/);
  assert.match(annual,/if \(!share\|\|!snapshot\) return \[\]/);
  assert.doesNotMatch(annual,/snapshot\?\.outstandingPrincipalCents\?\?loan\.outstandingPrincipalCents/);
});

console.log(`Audit remediation P0B ověřena: ${checks} kontrol.`);
