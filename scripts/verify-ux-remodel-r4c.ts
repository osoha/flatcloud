import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type { Prisma, RentForecastPlanStatus } from "@prisma/client";
import { parseRentForecastAssumptions, rentForecastBasisPointsFromPercent } from "../lib/reporting/rent-forecast";
import { calculateRentForecastTransferPreview } from "../lib/reporting/rent-forecast-transfer-preview";

const root=process.cwd(),read=(file:string)=>fs.readFileSync(path.join(root,file),"utf8");
let count=0;function check(name:string,test:()=>void){test();count+=1;console.log(`✓ ${count}. ${name}`);}

check("percentage inputs are strict, bounded and locale-aware",()=>{
  assert.equal(rentForecastBasisPointsFromPercent("4,25","Růst",2_000),425);
  assert.equal(rentForecastBasisPointsFromPercent("100","Inkaso"),10_000);
  assert.throws(()=>rentForecastBasisPointsFromPercent("4.251","Růst",2_000),/nejvýše dvěma/);
  assert.throws(()=>rentForecastBasisPointsFromPercent("20.01","Růst",2_000),/mezi 0 a 20/);
  assert.throws(()=>rentForecastBasisPointsFromPercent("-1","Vacancy"),/nejvýše dvěma/);
});

check("custom GET assumptions preserve safe preset fallbacks",()=>{
  const parsed=parseRentForecastAssumptions({annualGrowthPercent:"4.25",vacancyPercent:"neplatné",collectionPercent:"97.5",marketGapCapturePercent:"80"},"base");
  assert.equal(parsed.customized,true);assert.equal(parsed.assumptions.label,"Vlastní");
  assert.deepEqual([parsed.assumptions.annualGrowthBps,parsed.assumptions.vacancyBps,parsed.assumptions.collectionBps,parsed.assumptions.marketGapCaptureBps],[425,500,9_750,8_000]);
});

check("approved-plan dry run classifies addendum, renewal and no change",()=>{
  const rows=[
    {leaseId:"add",propertyId:"p",propertyName:"Dům",unitId:"u1",unitLabel:"1",currentRentCents:100_000,effectiveEnd:null,indexationEnabled:false,indexationPercentBps:null,nextIndexationAt:null,mfMarketRentCents:120_000},
    {leaseId:"renew",propertyId:"p",propertyName:"Dům",unitId:"u2",unitLabel:"2",currentRentCents:100_000,effectiveEnd:"2026-03-31T23:59:59.000Z",indexationEnabled:false,indexationPercentBps:null,nextIndexationAt:null,mfMarketRentCents:120_000},
    {leaseId:"same",propertyId:"p",propertyName:"Dům",unitId:"u3",unitLabel:"3",currentRentCents:100_000,effectiveEnd:null,indexationEnabled:false,indexationPercentBps:null,nextIndexationAt:null,mfMarketRentCents:100_000},
  ];
  const plan={name:"Test",status:"APPROVED" as RentForecastPlanStatus,asOfDate:new Date("2026-01-15T12:00:00Z"),horizonMonths:12,annualGrowthBps:0,vacancyBps:0,collectionBps:10_000,marketGapCaptureBps:10_000,inputSnapshot:{schemaVersion:1,scope:[{propertyId:"p",propertyName:"Dům"}],mfReferencePeriod:"Q4 2025",rows} as Prisma.JsonValue};
  const preview=calculateRentForecastTransferPreview(plan);
  assert.deepEqual(preview.rows.map((row)=>row.state),["ADDENDUM_REVIEW","RENEWAL_REQUIRED","NO_CHANGE"]);
  assert.deepEqual([preview.addendumReviewCount,preview.renewalRequiredCount,preview.noChangeCount],[1,1,1]);
  assert.equal(preview.effectivePeriod,"2026-12");
  assert.throws(()=>calculateRentForecastTransferPreview({...plan,status:"DRAFT" as RentForecastPlanStatus}),/pouze pro schválený/);
});

check("UI preserves assumptions and labels the preview as no-write",()=>{
  const report=read("app/reporty/page.tsx"),detail=read("app/reporty/valorizace/[planId]/page.tsx"),styles=read("app/globals.css");
  for(const marker of ["Vlastní předpoklady","Přepočítat vlastní scénář","annualGrowthPercent","Vlastní model","customSuffix"])assert.match(report,new RegExp(marker));
  for(const marker of ["Náhled převodu do dodatků","Dry run · bez zápisu","Nic se zatím nepřenáší do evidence","Nejprve obnovit nájem"])assert.match(detail,new RegExp(marker));
  for(const marker of ["forecast-assumption-form","forecast-transfer-preview","forecast-transfer-counts","input-suffix"])assert.match(styles,new RegExp(marker));
});

check("server saves explicit assumptions and preview cannot mutate lifecycle records",()=>{
  const route=read("app/api/rent-forecast-plans/route.ts"),service=read("lib/reporting/rent-forecast-plans.ts"),preview=read("lib/reporting/rent-forecast-transfer-preview.ts");
  for(const marker of ["annualGrowthPercent","vacancyPercent","collectionPercent","marketGapCapturePercent","rentForecastBasisPointsFromPercent"])assert.match(route,new RegExp(marker));
  assert.match(service,/validateAssumptions/);assert.doesNotMatch(preview,/from ["']@\/lib\/db|\.(create|update|delete|upsert)\(/);
  assert.doesNotMatch(`${service}\n${preview}`,/lease\.(update|create)|charge\.(update|create)|paymentItem\.(update|create)/);
});

check("methodology, pipeline, browser smoke and CI cover R4C",()=>{
  assert.match(read("lib/methodology.ts"),/dry-run náhled převodu/);
  assert.match(read("UX-REMODEL-PIPELINE.md"),/R4C implementováno bez migrace/);
  assert.match(read("e2e/flatcloud.smoke.spec.ts"),/Přepočítat vlastní scénář/);
  assert.match(read(".github/workflows/ci.yml"),/verify:ux-remodel-r4c/);
});

console.log(`UX remodel R4C ověřen: ${count} kontrol.`);
