import {prisma} from "./db";
import {Prisma} from "@prisma/client";
import {serializableTransaction} from "./serializable";
import {businessDateKey,businessDateKeyToInstant,type BusinessDateKey} from "./calendar";
import {currentReadings} from "./meter-reading-rules";
import {meterNeedsReading,annualReadingWindow} from "./meter-task-policy";

export async function runMeterTaskAutomation(now=new Date(),propertyId?:string) {
  const meters=await prisma.meter.findMany({where:{active:true,...(propertyId?{propertyId}:{}),property:{active:true}},include:{readings:true,property:{include:{manager:true,owner:{include:{user:true}}}},unit:{include:{ownerships:{include:{owner:{include:{user:true}}}}}}}});
  const groups=new Map<string,typeof meters>();
  for(const meter of meters){const key=`${meter.propertyId}:${meter.unitId||"house"}`;groups.set(key,[...(groups.get(key)||[]),meter]);}
  const today=businessDateKey(now),year=Number(today.slice(0,4)),annual=annualReadingWindow(now);
  let created=0,updated=0,closed=0;
  for(const [key,rows] of groups){
    const due=rows.filter(m=>annual||meterNeedsReading(currentReadings(m.readings).at(-1)?.readAt||null,m.createdAt,now));
    const result=await serializableTransaction(async tx=>{
      const where:Prisma.TaskWhereInput={propertyId:rows[0].propertyId,unitId:rows[0].unitId,dedupeKey:{startsWith:`meter-readings:${key}:`},status:{in:["OPEN","IN_PROGRESS","WAITING"]}};
      let task=await tx.task.findFirst({where,orderBy:{createdAt:"asc"},include:{checklistItems:true}});
      if(!task&&annual)task=await tx.task.findFirst({where:{propertyId:rows[0].propertyId,unitId:rows[0].unitId,dedupeKey:{startsWith:`meter-readings:${key}:`},status:"DONE",checklistItems:{some:{meterPeriodKey:`annual-${year}`}}},orderBy:{createdAt:"desc"},include:{checklistItems:true}});
      let isNew=false;
      if(!task&&due.length){
        const marker=annual?`annual-${year}`:`stale-${due.map(m=>`${m.id}-${currentReadings(m.readings).at(-1)?.id||"initial"}`).sort().join("|")}`;
        const dedupeKey=`meter-readings:${key}:${marker}`;
        const existing=await tx.task.findUnique({where:{dedupeKey},include:{checklistItems:true}});
        if(existing)return {created:0,updated:0,closed:0};
        const manager=rows[0].property.manager;
        const owners=[...new Set((rows[0].unit?.ownerships||[]).flatMap(o=>o.owner.user?.active?[o.owner.user.id]:[]))];
        const ownerId=owners.length===1?owners[0]:owners.length===0&&rows[0].property.owner.user?.active?rows[0].property.owner.user.id:null;
        task=await tx.task.create({data:{dedupeKey,title:`Odečty měřidel · ${rows[0].unit?.label||rows[0].property.name}`,description:"Doplňte stavy měřidel. Roční a průběžné odečty se řeší v jednom úkolu.",category:"MAINTENANCE",propertyId:rows[0].propertyId,unitId:rows[0].unitId,assigneeId:manager?.active?manager.id:ownerId,dueAt:annual?businessDateKeyToInstant(`${year}-12-31` as BusinessDateKey):now},include:{checklistItems:true}});
        isNew=true;
      }
      if(!task)return {created:0,updated:0,closed:0};
      let position=task.checklistItems.reduce((max,item)=>Math.max(max,item.position),-1)+1;
      const pending=task.checklistItems.filter(item=>item.meterId&&item.meterPeriodKey);
      for(const meter of due){
        const latest=currentReadings(meter.readings).at(-1);
        const periodKey=annual?`annual-${year}`:`stale-${latest?.id||"initial"}`;
        if(pending.some(item=>item.meterId===meter.id&&item.meterPeriodKey===periodKey))continue;
        const requiredFrom=annual?businessDateKeyToInstant(`${year}-12-01` as BusinessDateKey):latest?.readAt||meter.createdAt;
        const item=await tx.taskChecklistItem.create({data:{taskId:task.id,position:position++,title:`${meter.label||meter.type} · ${meter.serialNumber||meter.id} · ${annual?`31. 12. ${year}`:"po 90 dnech"}`,meterId:meter.id,meterPeriodKey:periodKey,baselineReadingId:annual?null:latest?.id||null,requiredFrom}});
        pending.push(item);
      }
      let completed=0;
      for(const item of pending.filter(i=>!i.completedAt)){
        const meter=rows.find(m=>m.id===item.meterId);
        if(!meter){await tx.taskChecklistItem.update({where:{id:item.id},data:{completedAt:now}});completed++;continue;}
        const readings=currentReadings(meter.readings);
        const hasReading=item.meterPeriodKey?.startsWith("annual-")?readings.some(r=>businessDateKey(r.readAt)>=`${item.meterPeriodKey!.slice(7)}-12-01`&&businessDateKey(r.readAt)<=`${item.meterPeriodKey!.slice(7)}-12-31`):readings.some(r=>r.id!==item.baselineReadingId&&r.readAt>=(item.requiredFrom||new Date(0)));
        if(hasReading){await tx.taskChecklistItem.update({where:{id:item.id},data:{completedAt:now}});completed++;}
      }
      const remaining=pending.length-completed-pending.filter(i=>i.completedAt).length;
      if(!remaining&&pending.length){if(task.status!=="DONE")await tx.task.update({where:{id:task.id},data:{status:"DONE",closedAt:now}});return{created:Number(isNew),updated:0,closed:task.status==="DONE"?0:1};}
      if(task.status==="DONE")await tx.task.update({where:{id:task.id},data:{status:"OPEN",closedAt:null}});
      if(annual){const annualDue=businessDateKeyToInstant(`${year}-12-31` as BusinessDateKey);if(!task.dueAt||task.dueAt>annualDue)await tx.task.update({where:{id:task.id},data:{dueAt:annualDue}});}
      return {created:Number(isNew),updated:Number(!isNew),closed:0};
    });
    created+=result.created;updated+=result.updated;closed+=result.closed;
  }
  return {created,updated,closed,summary:`Odečty: ${created} nových, ${updated} aktualizovaných, ${closed} dokončených úkolů.`};
}
