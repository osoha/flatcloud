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
    const templateBody=String(form.get("templateBody")||"").trim();
    if(!templateBody||templateBody.length>10000)throw new Error("Text úkolu musí mít 1 až 10 000 znaků.");
    const rule=await prisma.$transaction(async tx=>{
      const previous=await tx.taskAutomationRule.findUnique({where:{id}});
      if(!previous||previous.updatedAt.toISOString()!==form.get("revision"))throw new Error("Pravidlo se změnilo. Obnovte stránku.");
      if(globalEnabled&&!["LEASE_EXPIRY","LEASE_ANNIVERSARY","LEASE_TERMINATION"].includes(previous.event))throw new Error("Tento kandidát zatím nemá aktivní spouštěč.");
      const claim=await tx.taskAutomationRule.updateMany({where:{id,updatedAt:previous.updatedAt},data:{leadDays,priority:priority as "LOW"|"NORMAL"|"HIGH"|"URGENT",globalEnabled,defaultEnabled,templateBody}});
      if(claim.count!==1)throw new Error("Pravidlo se změnilo. Obnovte stránku.");
      await tx.auditLog.create({data:{userId:user.id,action:"TASK_AUTOMATION_RULE_UPDATED",entityType:"TaskAutomationRule",entityId:id,details:{before:{templateBody:previous.templateBody,leadDays:previous.leadDays,priority:previous.priority,globalEnabled:previous.globalEnabled,defaultEnabled:previous.defaultEnabled},after:{leadDays,priority,globalEnabled,defaultEnabled,templateBody}}}});
      return previous;
    });
    return goWithMessage(request,`/nastaveni/automaticke-ukoly#${rule.id}`,"ok","Pravidlo bylo uloženo.");
  }catch(error){return goWithMessage(request,"/nastaveni/automaticke-ukoly","error",error instanceof Error?error.message:"Pravidlo se nepodařilo uložit.")}
}
