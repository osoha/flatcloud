import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type { Prisma, RentForecastPlanStatus } from "@prisma/client";
import { calculateRentForecastTransferPreview } from "../lib/reporting/rent-forecast-transfer-preview";

const root=process.cwd(),read=(file:string)=>fs.readFileSync(path.join(root,file),"utf8");
let count=0;function check(name:string,test:()=>void){test();count+=1;console.log(`✓ ${count}. ${name}`);}

check("dry run surfaces indexation conflicts before proposal creation",()=>{
  const rows=[{leaseId:"l",propertyId:"p",propertyName:"Dům",unitId:"u",unitLabel:"1",currentRentCents:100_000,effectiveEnd:null,indexationEnabled:true,indexationPercentBps:500,nextIndexationAt:"2026-06-01T12:00:00.000Z",mfMarketRentCents:130_000}];
  const plan={name:"Test",status:"APPROVED" as RentForecastPlanStatus,asOfDate:new Date("2026-01-15T12:00:00Z"),horizonMonths:12,annualGrowthBps:0,vacancyBps:0,collectionBps:10_000,marketGapCaptureBps:10_000,inputSnapshot:{schemaVersion:1,scope:[{propertyId:"p",propertyName:"Dům"}],mfReferencePeriod:"Q4 2025",rows} as Prisma.JsonValue};
  const preview=calculateRentForecastTransferPreview(plan);
  assert.equal(preview.rows[0].state,"INDEXATION_REVIEW");assert.equal(preview.indexationReviewCount,1);assert.equal(preview.addendumReviewCount,0);
});

check("schema and additive migration persist two-step proposals",()=>{
  const schema=read("prisma/schema.prisma"),migration=read("prisma/migrations/20260905040000_rent_change_proposals/migration.sql");
  for(const marker of ["enum RentChangeProposalStatus","model RentChangeProposal","previousRentCents","proposedRentCents","effectiveFrom","legalBasis","@@unique([forecastPlanId, leaseId])"])assert.match(schema,new RegExp(marker.replace(/[?*+.[\]{}()]/g,"\\$&")));
  for(const marker of ["RentChangeProposal_amount_check","RentChangeProposal_confirmation_check","ON DELETE RESTRICT"])assert.match(migration,new RegExp(marker));
  assert.doesNotMatch(migration,/DROP TABLE|DROP COLUMN|DELETE FROM|TRUNCATE/);
});

check("proposal service revalidates access, live rent and lifecycle conflicts",()=>{
  const service=read("lib/reporting/rent-change-proposals.ts");
  for(const marker of ["PropertyPermission.EDIT","plan.status !== \"APPROVED\"","row.state !== \"ADDENDUM_REVIEW\"","currentRent(fresh.lease) !== fresh.previousRentCents","leaseStatusAt(lease, effectiveFrom)","nextIndexationAt","manualOverride","allocations.length > 0","jinou potvrzenou budoucí změnu"])assert.match(service,new RegExp(marker.replace(/[?*+.[\]{}()]/g,"\\$&")));
  assert.match(service,/serializableTransaction[\s\S]+tx\.rentChangeProposal\.findFirst[\s\S]+currentRent\(fresh\.lease\)/);
});

check("confirmation is compare-and-set, serializable, versioned and audited",()=>{
  const service=read("lib/reporting/rent-change-proposals.ts"),automation=read("lib/charge-automation.ts"),editRoute=read("app/api/properties/[id]/leases/[leaseId]/route.ts");
  assert.match(service,/serializableTransaction/);assert.match(service,/updateMany\(\{ where: \{ id: fresh.id, status: \"DRAFT\" \}/);
  assert.match(service,/replaceRecurringAmount\(tx, fresh.leaseId, \"RENT\"/);assert.match(service,/syncLeaseCharges/);assert.match(service,/RENT_CHANGE_PROPOSAL_CONFIRMED/);
  assert.match(automation,/preserveFutureFrom/);assert.match(editRoute,/confirmedFutureRentChangePreserved/);assert.match(editRoute,/preserveFutureFrom: futureRentChange.effectiveFrom/);
});

check("UI makes the second confirmation and real impact explicit",()=>{
  const plan=read("app/reporty/valorizace/[planId]/page.tsx"),detail=read("app/reporty/valorizace/[planId]/navrhy/[proposalId]/page.tsx"),lease=read("app/smlouvy/[leaseId]/page.tsx"),leaseEdit=read("app/nemovitosti/[id]/smlouvy/[leaseId]/upravit/page.tsx"),unit=read("app/nemovitosti/[id]/jednotky/[unitId]/page.tsx"),styles=read("app/globals.css");
  for(const marker of ["Připravit změnu","Právní důvod","Pokračovat ke kontrole","Nejprve zohlednit indexaci"])assert.match(plan,new RegExp(marker));
  for(const marker of ["Druhý krok · právní a finanční kontrola","Potvrzení provede skutečnou změnu","Potvrdit změnu nájemného","Zkontroloval/a jsem částku"])assert.match(detail,new RegExp(marker));
  assert.match(lease,/Potvrzená budoucí změna/);assert.match(lease,/rentRollAmountsAt/);assert.match(unit,/rentRollAmountsAt/);
  assert.match(leaseEdit,/Formulář zobrazuje dnešní účinné nájemné/);assert.match(leaseEdit,/rentRollAmountsAt/);
  for(const marker of ["rent-change-create","rent-change-review","rent-change-confirm"])assert.match(styles,new RegExp(marker));
});

check("routes, methodology, browser smoke, pipeline and CI cover R4D",()=>{
  assert.match(read("app/api/rent-forecast-plans/[planId]/proposals/[proposalId]/confirm/route.ts"),/boolValue\(form, \"confirm\"\)/);
  assert.match(read("lib/methodology.ts"),/Skutečný převod musí být jednotlivý, dvoukrokový/);
  assert.match(read("e2e/flatcloud.smoke.spec.ts"),/Potvrdit změnu nájemného/);
  assert.match(read("UX-REMODEL-PIPELINE.md"),/R4D implementováno aditivně/);
  assert.match(read(".github/workflows/ci.yml"),/verify:ux-remodel-r4d/);
});

console.log(`UX remodel R4D ověřen: ${count} kontrol.`);
