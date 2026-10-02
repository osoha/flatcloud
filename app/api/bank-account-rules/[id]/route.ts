import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireBankRuleAccount } from "@/lib/account-banking-access";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  const user=await currentUser();if(!user)return go(request,"/login");
  try {
    const {id}=await params;
    const rule=await prisma.accountBankRule.findUnique({where:{id}});
    if(!rule)throw new Error("Pravidlo není dostupné.");
    await requireBankRuleAccount(user,rule.ownerBankAccountId);
    const active=(await request.formData()).get("active")==="1";
    await prisma.$transaction(async tx=>{
      await tx.accountBankRule.update({where:{id},data:{active}});
      await tx.auditLog.create({data:{userId:user.id,action:"ACCOUNT_BANK_RULE_STATUS_CHANGED",entityType:"AccountBankRule",entityId:id,details:{active}}});
    });
    return goWithMessage(request,`/platby/banka/pravidla?account=${encodeURIComponent(rule.ownerBankAccountId)}`,"ok",active?"Pravidlo bylo zapnuto.":"Pravidlo bylo vypnuto.");
  } catch(error){return goWithMessage(request,"/platby/banka/pravidla","error",error instanceof Error?error.message:"Pravidlo se nepodařilo změnit.");}
}
