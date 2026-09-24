import { requirePropertyAdmin } from "@/lib/management";
import { prisma } from "@/lib/db";
import { go, goWithMessage } from "@/lib/route-response";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  const access=await requirePropertyAdmin(id);
  if(!access)return go(request,"/portfolio");
  const returnTo=`/nemovitosti/${id}/nastaveni/uzivatele`;
  const value=(await request.formData()).get("selfManaged");
  if(value!=="true"&&value!=="false")return goWithMessage(request,returnTo,"error","Vyberte způsob správy.");
  const selfManaged=value==="true";
  await prisma.$transaction(async tx=>{
    await tx.property.update({where:{id},data:{selfManaged}});
    await tx.auditLog.create({data:{userId:access.user.id,propertyId:id,action:"PROPERTY_TEAM_SETUP_UPDATED",entityType:"Property",entityId:id,details:{selfManaged}}});
  });
  return goWithMessage(request,returnTo,"ok",selfManaged?"Samostatná správa byla potvrzena.":"Můžete nastavit správce a spolupracovníky.");
}
