import {actualUser} from "@/lib/auth";
import {goWithMessage} from "@/lib/route-response";
import {prepareTenantMeterPhoto,recordTenantMeterReading,tenantMeterValue} from "@/lib/tenant-meter-readings";

export async function POST(request:Request,{params}:{params:Promise<{tenantId:string}>}) {
  const {tenantId}=await params;let target=`/portal/najemnik/${tenantId}#odecty`;
  const user=await actualUser();if(!user||user.role==="SUPER_ADMIN")return goWithMessage(request,target,"error","Tato akce není dostupná v administrátorském náhledu.");
  try {
    const form=await request.formData();const leaseId=String(form.get("leaseId")||"");
    if(leaseId)target=`/portal/najemnik/${tenantId}#odecty-${encodeURIComponent(leaseId)}`;
    const value=tenantMeterValue(form.get("value"));
    const photo=await prepareTenantMeterPhoto(form);
    await recordTenantMeterReading(user,{tenantId,leaseId,meterId:String(form.get("meterId")||""),readAt:String(form.get("readAt")||""),value,photo});
    return goWithMessage(request,target,"ok",photo?"Odečet i fotografie byly bezpečně uloženy.":"Odečet byl uložen.");
  }catch(error){return goWithMessage(request,target,"error",error instanceof Error?error.message:"Odečet se nepodařilo uložit.");}
}
