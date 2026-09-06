import { requireUser } from "@/lib/auth";
import { boolValue,dateValue,text } from "@/lib/forms";
import { createUnitDistributionReadiness } from "@/lib/distribution/unit-assessments";
import { goWithMessage, safeInternalReturnPath } from "@/lib/route-response";

export async function POST(request:Request,{params}:{params:Promise<{propertyId:string;unitId:string}>}){const user=await requireUser(),{propertyId,unitId}=await params;let returnTo="/distribuce";try{const form=await request.formData();returnTo=safeInternalReturnPath(form.get("returnTo"),returnTo);await createUnitDistributionReadiness(user,propertyId,unitId,{distributionReady:boolValue(form,"distributionReady"),assessedAt:dateValue(form,"assessedAt",true)!,note:text(form,"note")});return goWithMessage(request,returnTo,"ok","Nový stav distribuční připravenosti byl uložen do historie.")}catch(error){return goWithMessage(request,returnTo,"error",error instanceof Error?error.message:"Připravenost se nepodařilo uložit.")}}
