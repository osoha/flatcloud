import {prisma} from "./db";
import {businessDateKey,businessDateKeyToInstant} from "./calendar";
import {currentReadings} from "./meter-reading-rules";
import {meterNeedsReading,annualReadingWindow} from "./meter-task-policy";
export async function runMeterTaskAutomation(now=new Date()){
 const meters=await prisma.meter.findMany({where:{active:true,property:{active:true}},include:{readings:true,property:{include:{manager:true,owner:{include:{user:true}}}},unit:{include:{ownerships:{include:{owner:{include:{user:true}}}}}}}});
 let created=0;const year=businessDateKey(now).slice(0,4);
 const groups=new Map<string,typeof meters>();for(const m of meters){const key=`${m.propertyId}:${m.unitId||"house"}`;groups.set(key,[...(groups.get(key)||[]),m]);}
 for(const [key,rows] of groups){const annual=annualReadingWindow(now);const due=rows.filter(m=>annual||meterNeedsReading(currentReadings(m.readings).at(-1)?.readAt||null,m.createdAt,now));
 const existing=await prisma.task.findFirst({where:{propertyId:rows[0].propertyId,unitId:rows[0].unitId,dedupeKey:{startsWith:`meter-readings:${key}:`},status:{in:["OPEN","IN_PROGRESS","WAITING"]}},include:{checklistItems:true}});
 if(existing){
   for(const item of existing.checklistItems){const meter=rows.find(m=>item.title.endsWith(m.serialNumber||m.id));if(!meter)continue;const last=currentReadings(meter.readings).at(-1);if(last&&last.readAt>=existing.createdAt&&!item.completedAt)await prisma.taskChecklistItem.update({where:{id:item.id},data:{completedAt:now}});}
   const pending=await prisma.taskChecklistItem.count({where:{taskId:existing.id,completedAt:null}});
   if(!pending)await prisma.task.update({where:{id:existing.id},data:{status:"DONE",closedAt:now}});
   else if(annual)await prisma.task.update({where:{id:existing.id},data:{title:`Roční odečty k 31. 12. · ${rows[0].unit?.label||rows[0].property.name}`,dueAt:businessDateKeyToInstant(`${Number(year)}-12-31`)}});
   continue;
 }
 if(!due.length)continue;
 const marker=annual?`annual-${year}`:due.map(m=>`${m.id}-${currentReadings(m.readings).at(-1)?.id||"initial"}`).sort().join("|");
 const dedupeKey=`meter-readings:${key}:${marker}`;
 const manager=rows[0].property.manager;
 const owners=[...new Set((rows[0].unit?.ownerships||[]).flatMap(o=>o.owner.user?.active?[o.owner.user.id]:[]))];
 const ownerId=owners.length===1?owners[0]:owners.length===0&&rows[0].property.owner.user?.active?rows[0].property.owner.user.id:null;
 await prisma.task.upsert({where:{dedupeKey},update:{},create:{dedupeKey,title:annual?`Roční odečty k 31. 12. · ${rows[0].unit?.label||rows[0].property.name}`:`Doplnit odečty starší než 90 dní · ${rows[0].unit?.label||rows[0].property.name}`,description:"Zaznamenejte skutečné datum a stav měřidel. Roční a průběžné odečty řešíme společně v jednom úkolu.",category:"MAINTENANCE",propertyId:rows[0].propertyId,unitId:rows[0].unitId,assigneeId:manager?.active?manager.id:ownerId,dueAt:annual?businessDateKeyToInstant(`${Number(year)}-12-31`):now,checklistItems:{create:due.map((m,position)=>({position,title:`${m.label||m.type} · ${m.serialNumber||m.id}`}))}}});created++;
 }return{created,summary:`Odečty: ${created} nových úkolů.`};
}
