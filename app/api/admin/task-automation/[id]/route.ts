import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user=await currentUser();
  if(!user)return go(request,"/login");
  if(user.role!=="SUPER_ADMIN")return goWithMessage(request,"/portfolio","error","Automatická pravidla může spravovat pouze super-admin.");
  const {id}=await params;
  try{
    const form=await request.formData();
    const leadDays=Number(form.get("leadDays"));
    const priority=String(form.get("priority")||"NORMAL");
    if(!Number.isInteger(leadDays)||leadDays<0||leadDays>365)throw new Error("Předstih musí být celé číslo od 0 do 365 dní.");
    if(!["LOW","NORMAL","HIGH","URGENT"].includes(priority))throw new Error("Neplatná priorita.");
    const globalEnabled=form.get("globalEnabled")==="on",defaultEnabled=form.get("defaultEnabled")==="on";
    const rule=await prisma.taskAutomationRule.update({where:{id},data:{leadDays,priority:priority as "LOW"|"NORMAL"|"HIGH"|"URGENT",globalEnabled,defaultEnabled}});
    await prisma.auditLog.create({data:{userId:user.id,action:"TASK_AUTOMATION_RULE_UPDATED",entityType:"TaskAutomationRule",entityId:id,details:{leadDays,priority,globalEnabled,defaultEnabled}}});
    return goWithMessage(request,`/nastaveni/automaticke-ukoly#${rule.id}`,"ok","Pravidlo bylo uloženo.");
  }catch(error){return goWithMessage(request,"/nastaveni/automaticke-ukoly","error",error instanceof Error?error.message:"Pravidlo se nepodařilo uložit.")}
}
