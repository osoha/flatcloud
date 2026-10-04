import {actualUser} from "@/lib/auth";
import {prisma} from "@/lib/db";
import {activeTenantLease} from "@/lib/tenant-portal-access";
import {readingDate,validateReadingPosition} from "@/lib/meter-reading-rules";
import {serializableTransaction} from "@/lib/serializable";
import {goWithMessage} from "@/lib/route-response";

export async function POST(request:Request,{params}:{params:Promise<{tenantId:string}>}) {
  const {tenantId}=await params,target=`/portal/najemnik/${tenantId}#odecty`;
  const user=await actualUser();if(!user||user.role==="SUPER_ADMIN")return goWithMessage(request,target,"error","Tato akce není dostupná v administrátorském náhledu.");
  try {
    const form=await request.formData();const leaseId=String(form.get("leaseId")||"");
    const lease=await activeTenantLease(user.id,tenantId,leaseId);
    if(!lease)throw new Error("K tomuto nájemnímu vztahu nemáte přístup.");
    const meterId=String(form.get("meterId")||"");const raw=String(form.get("value")||"").replace(",",".");
    const value=Number(raw);if(!raw||!Number.isFinite(value))throw new Error("Zadejte platný stav měřidla.");
    const readAt=readingDate(String(form.get("readAt")||""));
    await serializableTransaction(async tx=>{
      const meter=await tx.meter.findFirst({where:{id:meterId,unitId:lease.unitId,propertyId:lease.unit.propertyId,active:true},include:{readings:true}});
      if(!meter)throw new Error("Měřidlo není dostupné.");
      validateReadingPosition(meter.readings,readAt,value);
      const reading=await tx.meterReading.create({data:{meterId,readAt,value,method:"PERSONAL",unitOfMeasure:meter.unitOfMeasure,leaseId:lease.id,createdById:user.id,note:"Zadal nájemník v portálu."}});
      await tx.auditLog.create({data:{userId:user.id,propertyId:lease.unit.propertyId,action:"TENANT_METER_READING_CREATED",entityType:"MeterReading",entityId:reading.id,details:{leaseId,meterId}}});
    });
    return goWithMessage(request,target,"ok","Odečet byl uložen.");
  }catch(error){return goWithMessage(request,target,"error",error instanceof Error?error.message:"Odečet se nepodařilo uložit.");}
}
