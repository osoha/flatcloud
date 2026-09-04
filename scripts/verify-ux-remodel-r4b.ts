import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { calculateRentForecastWithAssumptions, type RentForecastInput } from "../lib/reporting/rent-forecast";

const root=process.cwd(),read=(file:string)=>fs.readFileSync(path.join(root,file),"utf8");
let count=0;function check(name:string,test:()=>void){test();count+=1;console.log(`✓ ${count}. ${name}`);}

check("custom assumptions reproduce a saved plan independently of presets",()=>{
  const row:RentForecastInput={leaseId:"l",propertyId:"p",propertyName:"Dům",unitId:"u",unitLabel:"1",currentRentCents:100_000,effectiveEnd:null,indexationEnabled:false,indexationPercentBps:null,nextIndexationAt:null,mfMarketRentCents:200_000};
  const result=calculateRentForecastWithAssumptions([row],new Date("2026-01-15T12:00:00Z"),"saved",{label:"Schválený plán",annualGrowthBps:0,vacancyBps:0,collectionBps:10_000,marketGapCaptureBps:10_000},12);
  assert.equal(result.months[11].plannedCents,200_000);assert.equal(result.months[11].expectedCollectedCents,200_000);assert.equal(result.scenario.label,"Schválený plán");
});

check("schema and additive migration persist revisions, scope and approval",()=>{
  const schema=read("prisma/schema.prisma"),migration=read("prisma/migrations/20260905030000_rent_forecast_plans/migration.sql");
  for(const marker of ["enum RentForecastPlanStatus","model RentForecastPlan","inputSnapshot","@@unique([seriesId, revision])","model RentForecastPlanProperty"])assert.match(schema,new RegExp(marker.replace(/[?*+.[\]{}()]/g,"\\$&")));
  for(const marker of ["RentForecastPlan_approval_check","horizonMonths_check","ON DELETE RESTRICT","RentForecastPlan_seriesId_revision_key"])assert.match(migration,new RegExp(marker));
  assert.doesNotMatch(migration,/DROP TABLE|DROP COLUMN|DELETE FROM|TRUNCATE/);
});

check("service captures live inputs server-side and enforces whole-property edit access",()=>{
  const service=read("lib/reporting/rent-forecast-plans.ts");
  for(const marker of ["loadLiveReport(actor", "PropertyPermission.EDIT", "loadedIds.join", "inputSnapshot: snapshot", "permission: minimum === \"VIEW\"", "writesToLeases: false"])assert.match(service,new RegExp(marker.replace(/[?*+.[\]{}()]/g,"\\$&")));
  assert.doesNotMatch(service,/lease\.(update|create)|charge\.(update|create)|paymentItem\.(update|create)/);
});

check("approval is compare-and-set and revisions are serialized",()=>{
  const service=read("lib/reporting/rent-forecast-plans.ts");
  assert.match(service,/updateMany\(\{ where: \{ id: planId, status: \"DRAFT\" \}/);
  assert.match(service,/serializableTransaction/);assert.match(service,/Tato řada již má rozpracovanou revizi/);assert.match(service,/Novou revizi lze vytvořit pouze ze schváleného scénáře/);
});

check("UI explains immutable snapshot and no-write approval",()=>{
  const report=read("app/reporty/page.tsx"),detail=read("app/reporty/valorizace/[planId]/page.tsx");
  for(const marker of ["Uložit tuto variantu","Uložit jako koncept","neměnný snapshot","Uložené scénáře"])assert.match(report,new RegExp(marker));
  for(const marker of ["Zmrazený plán","smlouvy a předpisy zůstávají beze změny","Potvrdit schválení plánu","Historie revizí"])assert.match(detail,new RegExp(marker));
});

check("routes, methodology, browser smoke, pipeline and CI cover R4B",()=>{
  assert.match(read("app/api/rent-forecast-plans/[planId]/approve/route.ts"),/Smlouvy ani předpisy se nezměnily/);
  assert.match(read("lib/methodology.ts"),/Uložte projednávanou variantu jako koncept/);
  assert.match(read("e2e/flatcloud.smoke.spec.ts"),/uloží, schválí a verzují scénář valorizace/);
  assert.match(read("UX-REMODEL-PIPELINE.md"),/R4B implementováno aditivně/);
  assert.match(read(".github/workflows/ci.yml"),/verify:ux-remodel-r4b/);
});

console.log(`UX remodel R4B ověřen: ${count} kontrol.`);
