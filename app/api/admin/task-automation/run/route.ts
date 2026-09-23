import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { go, goWithMessage } from "@/lib/route-response";
import { runTaskAutomation } from "@/lib/task-automation";

export async function POST(request:Request){
  const user=await currentUser();if(!user)return go(request,"/login");
  if(user.role!=="SUPER_ADMIN")return goWithMessage(request,"/portfolio","error","Automatická pravidla může spustit pouze super-admin.");
  try{const result=await runTaskAutomation();await prisma.auditLog.create({data:{userId:user.id,action:"TASK_AUTOMATION_MANUAL_RUN",entityType:"TaskAutomationRule",entityId:"catalog",details:result}});return goWithMessage(request,"/nastaveni/automaticke-ukoly","ok",result.summary)}catch(error){return goWithMessage(request,"/nastaveni/automaticke-ukoly","error",error instanceof Error?error.message:"Běh automatických úkolů selhal.")}
}
