import { UnitInvestmentUrgency,UnitQualityRating } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { boolValue,dateValue,moneyToCents,text } from "@/lib/forms";
import { createUnitAssetAssessment } from "@/lib/distribution/unit-assessments";
import { goWithMessage, safeInternalReturnPath } from "@/lib/route-response";

export async function POST(request:Request,{params}:{params:Promise<{propertyId:string;unitId:string}>}){const user=await requireUser(),{propertyId,unitId}=await params;let returnTo="/distribuce";try{const form=await request.formData();returnTo=safeInternalReturnPath(form.get("returnTo"),returnTo);await createUnitAssetAssessment(user,propertyId,unitId,{rating:String(form.get("rating")) as UnitQualityRating,investmentUrgency:String(form.get("investmentUrgency")) as UnitInvestmentUrgency,estimatedCapexCents:moneyToCents(form,"estimatedCapex"),distributionReady:boolValue(form,"distributionReady"),assessedAt:dateValue(form,"assessedAt",true)!,note:text(form,"note")});return goWithMessage(request,returnTo,"ok","Nové hodnocení jednotky bylo uloženo do historie.")}catch(error){return goWithMessage(request,returnTo,"error",error instanceof Error?error.message:"Hodnocení se nepodařilo uložit.")}}
