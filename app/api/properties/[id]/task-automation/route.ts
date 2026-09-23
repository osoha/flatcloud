import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPropertyPermission } from "@/lib/management";
import { go,goWithMessage } from "@/lib/route-response";

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const user=await currentUser();if(!user)return go(request,"/login");const{id}=await params;
  if(!(await hasPropertyPermission(user,id,"EDIT")))return goWithMessage(request,`/nemovitosti/${id}/nastaveni`,"error","Nemáte oprávnění měnit automatické úkoly tohoto objektu.");
  try{const form=await request.formData(),ruleId=String(form.get("ruleId")||""),mode=String(form.get("mode")||"INHERIT");if(!ruleId||!["INHERIT","ENABLED","DISABLED"].includes(mode))throw new Error("Neplatné nastavení pravidla.");
    await prisma.taskAutomationPropertySetting.upsert({where:{ruleId_propertyId:{ruleId,propertyId:id}},create:{ruleId,propertyId:id,mode:mode as "INHERIT"|"ENABLED"|"DISABLED"},update:{mode:mode as "INHERIT"|"ENABLED"|"DISABLED"}});
    await prisma.auditLog.create({data:{userId:user.id,propertyId:id,action:"TASK_AUTOMATION_PROPERTY_UPDATED",entityType:"TaskAutomationRule",entityId:ruleId,details:{mode}}});
    return goWithMessage(request,`/nemovitosti/${id}/nastaveni/automaticke-ukoly#${ruleId}`,"ok","Místní nastavení bylo uloženo.");
  }catch(error){return goWithMessage(request,`/nemovitosti/${id}/nastaveni/automaticke-ukoly`,`error`,error instanceof Error?error.message:"Nastavení se nepodařilo uložit.")}
}
