import { Prisma, SettlementAllocationMethod } from "@prisma/client";
import { prisma } from "./db";
import { businessDateKeyToInstant } from "./calendar";
import { meterPeriodReadings } from "./meter-reading-rules";
import { allocateCents, meterLoss, overlapDays, personDays, weightedAreaDays } from "./settlement-allocation";
import { sourceMoney, type SourcePayload } from "./settlement-source-rules";
import { serializableTransaction } from "./serializable";

type Actor={id:string;role:string;allProperties?:boolean};
const endInstant=(key:string)=>new Date(key+"T23:59:59.999Z");
const startInstant=(key:string)=>businessDateKeyToInstant(key as any);

export async function confirmSettlementAllocation(actor:Actor,propertyId:string,sourceId:string,lineKey:string,ruleId:string){
 return serializableTransaction(async tx=>{
  const source=await tx.settlementSource.findFirst({where:{id:sourceId,propertyId,confirmedAt:{not:null}}});
  if(!source)throw new Error("Nejprve potvrďte zdrojový podklad.");
  if(await tx.settlementAllocationBatch.findUnique({where:{sourceId_lineKey:{sourceId,lineKey}}}))throw new Error("Tento řádek už má potvrzené rozdělení.");
  const payload=source.payload as unknown as SourcePayload,line=payload.lines.find(l=>l.key===lineKey&&l.role==="COST");
  if(!line||line.unitId)throw new Error("Rozdělit lze pouze domovní nákladový řádek.");
  const rule=await tx.settlementAllocationRule.findFirst({where:{id:ruleId,propertyId,active:true}});
  if(!rule||rule.service!==line.service)throw new Error("Pravidlo neodpovídá službě.");
  if(rule.method==="EXTERNAL_RESULT")throw new Error("Externí výsledek musí být vložen jako podklad konkrétní jednotky, nikoli dopočítán.");
  if(rule.method==="MANUAL")throw new Error("Ruční rozdělení vyžaduje samostatně doložené řádky; automatické potvrzení není povoleno.");
  const from=startInstant(line.from),to=endInstant(line.to),periodDays=overlapDays(from,to,from,to);
  const units=await tx.unit.findMany({where:{propertyId},include:{areaPeriods:true,leases:{include:{occupancyPeriods:true}},meters:{where:{type:rule.meterType??undefined},include:{readings:{orderBy:{readAt:"asc"}}}}}});
  if(!units.length)throw new Error("Objekt nemá jednotky.");
  const basis:Array<{id:string;basis:number;unitId:string;leaseId:string|null;label:string}>=[];const meterConsumptions:number[]=[];
  for(const unit of units){
    const leases=unit.leases.filter(l=>overlapDays(from,to,l.startDate,l.terminatedOn??l.endDate)>0);
    if(rule.method==="PERSON_DAYS"){
      for(const lease of leases){const b=personDays(from,to,lease.occupancyPeriods);if(b>0)basis.push({id:`${unit.id}:${lease.id}`,basis:b,unitId:unit.id,leaseId:lease.id,label:`Osobodny · ${b}`});}
      if(leases.length&&!basis.some(b=>b.unitId===unit.id))throw new Error(`Jednotka ${unit.label}: chybí časová evidence počtu osob.`);
      continue;
    }
    let unitBasis=0;
    if(rule.method==="AREA"){
      unitBasis=unit.areaPeriods.length?weightedAreaDays(from,to,unit.areaPeriods):((unit.areaM2??0)*periodDays);
      if(unitBasis<=0)throw new Error(`Jednotka ${unit.label}: chybí plocha.`);
    } else if(rule.method==="METER_CONSUMPTION"){
      if(!rule.meterType)throw new Error("Pravidlo podle spotřeby musí určit typ měřidla.");
      const meter=unit.meters.find(m=>m.scope==="UNIT");
      if(!meter)throw new Error(`Jednotka ${unit.label}: chybí podružné měřidlo.`);
      const period=meterPeriodReadings(meter.readings,line.from,line.to);
      if(period.consumption==null)throw new Error(`Jednotka ${unit.label}: chybí hraniční odečty.`);
      unitBasis=period.consumption;meterConsumptions.push(unitBasis);
    }
    const leaseDays=leases.map(l=>({lease:l,days:overlapDays(from,to,l.startDate,l.terminatedOn??l.endDate)}));
    const occupied=Math.min(periodDays,leaseDays.reduce((s,x)=>s+x.days,0)),vacancy=Math.max(0,periodDays-occupied);
    for(const x of leaseDays)if(x.days>0)basis.push({id:`${unit.id}:${x.lease.id}`,basis:unitBasis*x.days/periodDays,unitId:unit.id,leaseId:x.lease.id,label:`${rule.method==="AREA"?"Plocha × dny":"Spotřeba × doba nájmu"} · ${x.days} dnů`});
    if(vacancy>0)basis.push({id:`${unit.id}:vacancy`,basis:unitBasis*vacancy/periodDays,unitId:unit.id,leaseId:null,label:`Neobsazenost · ${vacancy} dnů`});
  }
  let loss:ReturnType<typeof meterLoss>|null=null;
  if(rule.method==="METER_CONSUMPTION"){
    const mains=await tx.meter.findMany({where:{propertyId,scope:"HOUSE_MAIN",type:rule.meterType??undefined},include:{readings:{orderBy:{readAt:"asc"}}}});
    if(mains.length!==1)throw new Error("Pro spotřební pravidlo musí být právě jedno hlavní domovní měřidlo daného média.");
    const p=meterPeriodReadings(mains[0].readings,line.from,line.to);if(p.consumption==null)throw new Error("Hlavnímu domovnímu měřidlu chybí hraniční odečty.");
    loss=meterLoss(p.consumption,meterConsumptions);if(!loss.valid)throw new Error("Součet podružných spotřeb je vyšší než hlavní měřidlo.");
  }
  const totalCents=sourceMoney(line.amount),allocated=allocateCents(totalCents,basis.map(b=>({id:b.id,basis:b.basis})));
  const meta=new Map(basis.map(b=>[b.id,b]));
  const batch=await tx.settlementAllocationBatch.create({data:{propertyId,sourceId,lineKey,ruleId,method:rule.method,totalCents,basisSnapshot:{from:line.from,to:line.to,method:rule.method,meterLoss:loss,bases:basis} as Prisma.InputJsonValue,confirmedById:actor.id,rows:{create:allocated.map(a=>{const m=meta.get(a.id)!;return {unitId:m.unitId,leaseId:m.leaseId,basis:a.basis,shareBasisPoints:a.shareBasisPoints,amountCents:a.amountCents,label:m.label};})}}});
  await tx.auditLog.create({data:{userId:actor.id,propertyId,action:"SETTLEMENT_ALLOCATION_CONFIRMED",entityType:"SettlementAllocationBatch",entityId:batch.id,details:{sourceId,lineKey,ruleId,method:rule.method,totalCents}}});
  return batch;
 });
}
