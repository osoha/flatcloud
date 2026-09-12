import {UnitValuationSource} from "@prisma/client";
import {requireUser} from "@/lib/auth";
import {dateValue,moneyToCents,text} from "@/lib/forms";
import {createUnitValuationSnapshot} from "@/lib/distribution/unit-valuations";
import {goWithMessage,safeInternalReturnPath} from "@/lib/route-response";
export async function POST(request:Request,{params}:{params:Promise<{propertyId:string;unitId:string}>}){const user=await requireUser(),{propertyId,unitId}=await params;let returnTo="/distribuce";try{const form=await request.formData();returnTo=safeInternalReturnPath(form.get("returnTo"),returnTo);await createUnitValuationSnapshot(user,propertyId,unitId,{marketValueCents:moneyToCents(form,"marketValue"),source:String(form.get("source")) as UnitValuationSource,valuationDate:dateValue(form,"valuationDate",true)!,reference:text(form,"reference"),note:text(form,"note")});return goWithMessage(request,returnTo,"ok","Nová valuace jednotky byla uložena do historie.")}catch(error){return goWithMessage(request,returnTo,"error",error instanceof Error?error.message:"Valuaci se nepodařilo uložit.")}}
