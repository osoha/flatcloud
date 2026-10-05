import {requireManagedProperty} from "@/lib/management";
import {readingDate,validateReadingPosition} from "@/lib/meter-reading-rules";
import {serializableTransaction} from "@/lib/serializable";
import {go,goWithMessage} from "@/lib/route-response";

/** All selected readings are checked and written in one transaction. Empty fields are skipped. */
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  const {id}=await params, access=await requireManagedProperty(id);
  if(!access)return go(request,"/login");
  const path=`/nemovitosti/${id}/meridla`;
  try {
    const form=await request.formData(),readAt=readingDate(String(form.get("readAt")||""));
    const values=Array.from(form.entries()).filter(([key,value])=>key.startsWith("value:")&&typeof value==="string"&&value.trim()!=="").map(([key,value])=>({id:key.slice(6),value:Number(value)}));
    if(!values.length)throw new Error("Vyplňte stav alespoň jednoho měřidla.");
    if(values.length>100||new Set(values.map(v=>v.id)).size!==values.length||values.some(v=>!Number.isFinite(v.value)||v.value<0))throw new Error("Seznam odečtů není platný.");
    await serializableTransaction(async tx=>{
      const meters=await tx.meter.findMany({where:{propertyId:id,id:{in:values.map(v=>v.id)},active:true},include:{readings:true}});
      if(meters.length!==values.length)throw new Error("Některé měřidlo není aktivní nebo nepatří objektu. Obnovte stránku.");
      for(const row of values){
        const meter=meters.find(m=>m.id===row.id)!;
        validateReadingPosition(meter.readings,readAt,row.value);
        const reading=await tx.meterReading.create({data:{meterId:meter.id,readAt,value:row.value,method:"PERSONAL",unitOfMeasure:meter.unitOfMeasure,createdById:access.user.id}});
        await tx.auditLog.create({data:{userId:access.user.id,propertyId:id,action:"METER_READING_CREATED",entityType:"MeterReading",entityId:reading.id,details:{meterId:meter.id,unitId:meter.unitId,method:"PERSONAL",bulk:true}}});
      }
    });
    return goWithMessage(request,path,"ok",`Uloženo ${values.length} odečtů.`);
  } catch(error){return goWithMessage(request,path,"error",error instanceof Error?error.message:"Odečty se nepodařilo uložit.");}
}
