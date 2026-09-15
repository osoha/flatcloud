import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { defaultServiceSettlementPeriod, parseServiceSettlementPeriod, serviceCostAllocationForUnit } from "../lib/service-settlement-preview";

const root=process.cwd(),read=(file:string)=>fs.readFileSync(path.join(root,file),"utf8");
let count=0;function check(name:string,test:()=>void){test();count+=1;console.log(`✓ ${count}. ${name}`);}

check("default period is the previous closed calendar year",()=>{
  assert.deepEqual(defaultServiceSettlementPeriod(new Date("2026-09-05T12:00:00Z")),{from:"2025-01-01",to:"2025-12-31"});
});

check("period validation rejects future reversed and overlong ranges",()=>{
  const now=new Date("2026-09-05T12:00:00Z");
  assert.equal(parseServiceSettlementPeriod("2025-01-01","2025-12-31",now).from,"2025-01-01");
  assert.throws(()=>parseServiceSettlementPeriod("2025-12-31","2025-01-01",now),/Začátek/);
  assert.throws(()=>parseServiceSettlementPeriod("2026-01-01","2026-12-31",now),/budoucnosti/);
  assert.throws(()=>parseServiceSettlementPeriod("2024-01-01","2025-12-31",now),/12 měsíců/);
});

check("twelve calendar months include leap years and reject one extra day",()=>{
  const now=new Date("2026-09-15T12:00:00Z");
  for(const [from,to] of [["2024-01-01","2024-12-31"],["2024-03-01","2025-02-28"],["2024-02-29","2025-02-27"],["2025-08-31","2026-08-30"]]) assert.doesNotThrow(()=>parseServiceSettlementPeriod(from,to,now));
  for(const [from,to] of [["2024-01-01","2025-01-01"],["2024-02-29","2025-02-28"],["2025-08-31","2026-08-31"]]) assert.throws(()=>parseServiceSettlementPeriod(from,to,now),/12 měsíců/);
  assert.throws(()=>parseServiceSettlementPeriod("2025-02-30","2025-03-01",now),/platné datum/);
});

check("only direct or stored unit allocation enters actual costs",()=>{
  const direct={unitId:"u1",amountCents:100_000,allocations:[]};
  assert.deepEqual(serviceCostAllocationForUnit(direct,"u1"),{amountCents:100_000,label:"Přímo jednotce"});
  assert.equal(serviceCostAllocationForUnit(direct,"u2"),null);
  const shared={unitId:null,amountCents:300_000,allocations:[{unitId:"u1",shareBasisPoints:3333,amountCents:100_000}]};
  assert.equal(serviceCostAllocationForUnit(shared,"u1")?.amountCents,100_000);
  assert.equal(serviceCostAllocationForUnit(shared,"u2"),null);
});

check("preview is scoped and separates service advances from rent",()=>{
  const service=read("lib/service-settlement-preview.ts");
  for(const marker of ["leaseAccessWhere(actor)","status: \"ACTUAL\"","kind: \"OPEX\"","category: \"UTILITIES\"","serviceCategories","unallocatedCosts","balanceCents: actualCostsCents - advancesCents"])assert.match(service,new RegExp(marker.replace(/[?*+.[\]{}()]/g,"\\$&")));
});

check("UI leads with preview sources blockers and no-write language",()=>{
  const page=read("app/smlouvy/[leaseId]/vyuctovani/page.tsx"),lease=read("app/smlouvy/[leaseId]/page.tsx"),styles=read("app/globals.css");
  for(const marker of ["Pracovní náhled · bez zaúčtování","Předepsané zálohy","Skutečné náklady a způsob rozdělení","Odečty měřidel","Uložit bez zaúčtování"])assert.match(page,new RegExp(marker));
  assert.match(lease,/Připravit vyúčtování/);assert.match(lease,/Korekční zápis výsledku bez protokolu/);
  for(const marker of ["service-settlement-page","settlement-summary-grid","settlement-readiness"])assert.match(styles,new RegExp(marker));
});

check("methodology pipeline browser smoke and CI cover R5A",()=>{
  assert.match(read("lib/methodology.ts"),/pracovní náhled je read-only/);
  assert.match(read("UX-REMODEL-PIPELINE.md"),/R5A implementováno bez migrace/);
  assert.match(read("e2e/flatcloud.smoke.spec.ts"),/vyúčtování ukáže read-only zdroje a blokátory/);
  assert.match(read(".github/workflows/ci.yml"),/verify:ux-remodel-r5a/);
});

console.log(`UX remodel R5A ověřen: ${count} kontrol.`);
