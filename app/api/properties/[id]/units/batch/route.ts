import { prisma } from "@/lib/db";
import { text } from "@/lib/forms";
import { audit, requireManagedProperty } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";
import { parseUnitBatch } from "@/lib/unit-batch";

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const{id}=await params;const access=await requireManagedProperty(id);if(!access)return go(request,"/login");
  try{const form=await request.formData(),rows=parseUnitBatch(text(form,"units",true)!),ownerId=text(form,"ownerId",true)!,ownerBankAccountId=text(form,"ownerBankAccountId");
    const[owner,account,existing]=await Promise.all([prisma.owner.findFirst({where:{id:ownerId,active:true},select:{id:true}}),ownerBankAccountId?prisma.ownerBankAccount.findFirst({where:{id:ownerBankAccountId,ownerId,active:true},select:{id:true}}):Promise.resolve(null),prisma.unit.findMany({where:{propertyId:id,label:{in:rows.map((row)=>row.label)}},select:{label:true}})]);
    if(!owner)throw new Error("Vyberte aktivního vlastníka.");if(ownerBankAccountId&&!account)throw new Error("Vybraný účet nepatří zvolenému vlastníkovi nebo není aktivní.");if(existing.length)throw new Error(`V objektu už existuje: ${existing.map((row)=>row.label).join(", ")}.`);
    const created=await prisma.$transaction(async(tx)=>{if(ownerBankAccountId)await tx.propertyPaymentAccount.upsert({where:{propertyId_ownerBankAccountId:{propertyId:id,ownerBankAccountId}},update:{active:true},create:{propertyId:id,ownerBankAccountId,active:true}});const units=[];for(const row of rows)units.push(await tx.unit.create({data:{propertyId:id,label:row.label,floor:row.floor,areaM2:row.areaM2,type:"APARTMENT",operationalStatus:"STANDARD",ownerships:{create:{ownerId,ownerBankAccountId:ownerBankAccountId||null,shareBasisPoints:10000}},operationalStatusEvents:{create:{status:"STANDARD",source:"USER_CHANGE",createdById:access.user.id,effectiveAt:new Date()}}}}));return units;});
    await audit(access.user.id,"UNITS_BATCH_CREATED","Property",id,{propertyId:id,count:created.length,unitIds:created.map((unit)=>unit.id),ownerId,ownerBankAccountId},id);return goWithMessage(request,`/nemovitosti/${id}/jednotky`,"ok",`${created.length} jednotek bylo založeno${ownerBankAccountId?".":" bez účtu; doplňte jej před založením smluv."}`);
  }catch(error){return goWithMessage(request,`/nemovitosti/${id}/jednotky/hromadne`,"error",error instanceof Error?error.message:"Jednotky se nepodařilo založit.")}
}
