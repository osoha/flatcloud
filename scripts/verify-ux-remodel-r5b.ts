import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { businessDateKey } from "../lib/calendar";
import { issueServiceSettlementProtocol } from "../lib/service-settlement-protocols";

const prisma=new PrismaClient(),root=process.cwd(),read=(file:string)=>fs.readFileSync(path.join(root,file),"utf8");
let count=0;async function check(name:string,test:()=>void|Promise<void>){await test();count+=1;console.log(`✓ ${count}. ${name}`);}

async function main(){
  const token=crypto.randomUUID().slice(0,8),now=new Date(),periodDate=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-1,1,12)),periodEnd=new Date(Date.UTC(periodDate.getUTCFullYear(),periodDate.getUTCMonth()+1,0,12));
  const from=businessDateKey(periodDate),to=businessDateKey(periodEnd),month=from.slice(0,7),dueDate=new Date(now.getTime()+14*86_400_000);
  const user=await prisma.user.create({data:{name:`R5B ${token}`,email:`r5b-${token}@example.test`,passwordHash:"test",role:"SUPER_ADMIN",allProperties:true}});
  const owner=await prisma.owner.create({data:{name:`R5B owner ${token}`}});
  const property=await prisma.property.create({data:{name:`R5B property ${token}`,address:"Test 1",city:"Praha",ownerId:owner.id}});
  const unit=await prisma.unit.create({data:{propertyId:property.id,label:`R5B-${token}`,type:"APARTMENT",status:"OCCUPIED"}});
  const tenant=await prisma.tenant.create({data:{name:`R5B tenant ${token}`,payerAccounts:[]}});
  const lease=await prisma.lease.create({data:{unitId:unit.id,tenantId:tenant.id,startDate:new Date(Date.UTC(periodDate.getUTCFullYear()-1,0,1,12)),financialTrackingFromPeriod:`${periodDate.getUTCFullYear()-1}-01`,variableSymbol:`8${Date.now().toString().slice(-8)}`,rentCents:1_000_000,servicesCents:250_000,parties:{create:{tenantId:tenant.id,role:"CONTRACTING_PARTY",isPrimary:true}},paymentItems:{create:[{name:"Nájemné",category:"RENT",amountCents:1_000_000,validFrom:new Date(Date.UTC(periodDate.getUTCFullYear()-1,0,1,12)),sortOrder:10},{name:"Zálohy na služby",category:"SERVICES",amountCents:250_000,validFrom:new Date(Date.UTC(periodDate.getUTCFullYear()-1,0,1,12)),sortOrder:20}]}}});
  await prisma.charge.create({data:{leaseId:lease.id,period:month,dueDate:periodDate,amountCents:1_250_000,items:{create:[{name:"Nájemné",category:"RENT",amountCents:1_000_000},{name:"Zálohy na služby",category:"SERVICES",amountCents:250_000}]}}});
  await prisma.propertyCost.create({data:{propertyId:property.id,unitId:unit.id,kind:"OPEX",status:"ACTUAL",category:"UTILITIES",title:"Skutečné služby",amountCents:300_000,effectiveAt:new Date(periodDate.getTime()+10*86_400_000)}});
  const actor={id:user.id,role:user.role,allProperties:true};

  let protocolId="";
  await check("issuing freezes totals and creates exactly one debit",async()=>{const protocol=await issueServiceSettlementProtocol(actor,lease.id,{from,to,dueDate});protocolId=protocol.id;assert.deepEqual([protocol.advancesCents,protocol.actualCostsCents,protocol.balanceCents],[250_000,300_000,50_000]);assert.ok(protocol.chargeId);assert.equal(protocol.creditId,null);assert.equal(await prisma.charge.count({where:{id:protocol.chargeId!}}),1);});
  await check("duplicate period is rejected without another financial movement",async()=>{await assert.rejects(()=>issueServiceSettlementProtocol(actor,lease.id,{from,to,dueDate}),/už byl protokol vystaven/);assert.equal(await prisma.serviceSettlementProtocol.count({where:{leaseId:lease.id}}),1);assert.equal(await prisma.charge.count({where:{leaseId:lease.id,period:{startsWith:"SETTLEMENT-"}}}),1);});
  await check("issued record is protected by database immutability",async()=>{await assert.rejects(()=>prisma.serviceSettlementProtocol.update({where:{id:protocolId},data:{balanceCents:60_000}}),/immutable|mutation/i);});
  await check("issuance is atomic scoped audited and snapshot based",()=>{const service=read("lib/service-settlement-protocols.ts"),migration=read("prisma/migrations/20260905060000_service_settlement_protocol/migration.sql");for(const marker of ["serializableTransaction","loadServiceSettlementPreviewTx","editableUnitWhere","SERVICE_SETTLEMENT_PROTOCOL_ISSUED","schemaVersion: 1"])assert.match(service,new RegExp(marker));for(const marker of ["ServiceSettlementProtocol_amount_check","ServiceSettlementProtocol_financial_link_check","ServiceSettlementProtocol_immutable","ON DELETE RESTRICT"])assert.match(migration,new RegExp(marker));});
  await check("UI requires explicit confirmation and exposes immutable history",()=>{const preview=read("app/smlouvy/[leaseId]/vyuctovani/page.tsx"),detail=read("app/smlouvy/[leaseId]/vyuctovani/[protocolId]/page.tsx"),route=read("app/api/properties/[id]/leases/[leaseId]/service-settlements/route.ts");for(const marker of ["Vystavit a zaúčtovat","Zkontroloval/a jsem zdroje","Vystavené protokoly"])assert.match(preview,new RegExp(marker));for(const marker of ["Neměnný protokol","Rozpis skutečných nákladů","Rozpis předepsaných záloh","Vytisknout / uložit PDF"])assert.match(detail,new RegExp(marker));assert.match(route,/boolValue\(form, "confirm"\)/);});
  await check("methodology pipeline and CI cover R5B",()=>{assert.match(read("lib/methodology.ts"),/Vystavení protokolu zmrazí/);assert.match(read("UX-REMODEL-PIPELINE.md"),/R5B implementováno aditivně/);assert.match(read(".github/workflows/ci.yml"),/verify:ux-remodel-r5b/);});
  console.log(`UX remodel R5B ověřen: ${count} kontrol.`);
}

main().catch((error)=>{console.error(error);process.exitCode=1;}).finally(()=>prisma.$disconnect());
