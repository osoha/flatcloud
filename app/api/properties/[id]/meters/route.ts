import { MeterScope, MeterType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { text } from "@/lib/forms";
import { requireManagedProperty, audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";
import { validateMeterHierarchy } from "@/lib/meter-hierarchy";

const defaultUnits: Record<MeterType,string>={COLD_WATER:"m³",HOT_WATER:"m³",ELECTRICITY_HIGH_TARIFF:"kWh",ELECTRICITY_LOW_TARIFF:"kWh",GAS:"m³"};

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  const {id}=await params; const access=await requireManagedProperty(id); if(!access)return go(request,"/login");
  try {
    const form=await request.formData();
    const scope=text(form,"scope",true)! as MeterScope, type=text(form,"type",true)! as MeterType;
    if(!["HOUSE_MAIN","HOUSE_SUBMETER"].includes(scope)) throw new Error("Na této stránce lze založit pouze domovní měřidlo.");
    if(!Object.values(MeterType).includes(type)) throw new Error("Neplatný typ měřidla.");
    const parentId=text(form,"parentId"),replacementOfId=text(form,"replacementOfId"),installedRaw=text(form,"installedAt");
    const unitOfMeasure=text(form,"unitOfMeasure")||defaultUnits[type];
    const existing=await prisma.meter.findMany({where:{propertyId:id},select:{id:true,propertyId:true,unitId:true,scope:true,parentId:true,replacementOfId:true,type:true,unitOfMeasure:true,installedAt:true,removedAt:true}});
    const installedAt=installedRaw?new Date(installedRaw+"T12:00:00Z"):new Date();
    const candidate={id:"new",propertyId:id,unitId:null,scope,parentId,replacementOfId,type,unitOfMeasure,installedAt,removedAt:null};
    validateMeterHierarchy(candidate,existing);
    if(scope==="HOUSE_SUBMETER"&&!parentId) throw new Error("Podružné měřidlo musí mít nadřazené hlavní měřidlo.");
    const meter=await prisma.$transaction(async tx=>{
      if(replacementOfId){
        const previous=await tx.meter.findFirst({where:{id:replacementOfId,propertyId:id,active:true}});
        if(!previous) throw new Error("Nahrazované měřidlo už není aktivní.");
        await tx.meter.update({where:{id:previous.id},data:{active:false,removedAt:installedAt}});
      }
      return tx.meter.create({data:{propertyId:id,scope,type,parentId,replacementOfId,label:text(form,"label"),serialNumber:text(form,"serialNumber"),location:text(form,"location"),unitOfMeasure,installedAt}});
    });
    await audit(access.user.id,"HOUSE_METER_CREATED","Meter",meter.id,{propertyId:id,scope,type,parentId,replacementOfId},id);
    return goWithMessage(request,`/nemovitosti/${id}/meridla`,"ok",replacementOfId?"Výměna měřidla byla uložena a historie zůstala zachována.":"Domovní měřidlo bylo přidáno.");
  } catch(error) {return goWithMessage(request,`/nemovitosti/${id}/meridla`,"error",error instanceof Error?error.message:"Měřidlo se nepodařilo uložit.");}
}
