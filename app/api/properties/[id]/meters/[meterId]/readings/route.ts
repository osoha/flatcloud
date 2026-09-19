import { requireManagedProperty } from "@/lib/management";
import { floatValue, text } from "@/lib/forms";
import { recordMeterReading } from "@/lib/meter-readings";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request:Request,{params}:{params:Promise<{id:string;meterId:string}>}) {
  const {id,meterId}=await params; const access=await requireManagedProperty(id); if(!access)return go(request,"/login");
  try {
    const form=await request.formData(),value=floatValue(form,"value");
    if(value===null) throw new Error("Zadejte stav měřidla.");
    await recordMeterReading(access.user,{propertyId:id,unitId:null,meterId,value,readAt:text(form,"readAt",true)!,method:text(form,"method",true)!,note:text(form,"note"),correctsId:text(form,"correctsId"),correctionReason:text(form,"correctionReason"),evidenceDocumentId:text(form,"evidenceDocumentId")});
    return goWithMessage(request,`/nemovitosti/${id}/meridla`,"ok","Domovní odečet byl uložen. Historie zůstává zachována.");
  } catch(error) {return goWithMessage(request,`/nemovitosti/${id}/meridla`,"error",error instanceof Error?error.message:"Odečet se nepodařilo uložit.");}
}
