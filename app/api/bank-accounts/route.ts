import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { bankOwnerScope } from "@/lib/bank-account-permissions";
import { samePhysicalBankAccount, validateOwnerBankAccount, czIbanFromDomestic } from "@/lib/owner-bank-account";
import { go, goWithMessage } from "@/lib/route-response";
export async function POST(request:Request){
  const user=await currentUser();if(!user)return go(request,"/login");
  const form=await request.formData(),ownerId=String(form.get("ownerId")||""),unitId=String(form.get("returnUnitId")||"");
  const back=`/bankovni-ucty${unitId?`?unitId=${encodeURIComponent(unitId)}`:""}`;
  try{
    const saved=await prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended('flatberry:bank-account-changes',0))`;
      const owner=await tx.owner.findFirst({where:{id:ownerId,active:true,...bankOwnerScope(user)}});
      if(!owner)throw new Error("Vlastník není dostupný pro správu účtů.");
      const account=validateOwnerBankAccount({label:String(form.get("label")||""),accountNumber:String(form.get("accountNumber")||""),bankCode:String(form.get("bankCode")||""),iban:String(form.get("iban")||""),currency:"CZK"});
      if(account.iban&&account.accountNumber&&account.iban!==czIbanFromDomestic(account.accountNumber,account.bankCode))throw new Error("IBAN neodpovídá zadanému domácímu číslu účtu.");
      if(account.label&&account.label.length>100)throw new Error("Název účtu může mít nejvýše 100 znaků.");
      if((await tx.ownerBankAccount.findMany({where:{ownerId}})).some(a=>samePhysicalBankAccount(a,account)))throw new Error("Tento účet již vlastník eviduje. Použijte existující účet; pokud jej nevidíte, musí vám jej vlastník zpřístupnit přiřazením k jednotce.");
      const result=await tx.ownerBankAccount.create({data:{ownerId,...account,createdById:user.id}});
      await tx.auditLog.create({data:{userId:user.id,action:"OWNER_BANK_ACCOUNT_REGISTERED",entityType:"OwnerBankAccount",entityId:result.id,details:{ownerId}}});return result;
    });
    return goWithMessage(request,`${back}${unitId?"&":"?"}accountId=${saved.id}#ucet-${saved.id}`,"ok","Účet je uložený. Nyní jej můžete vybrat pro nájemné; bankovní notifikace lze ověřit později. Platební pokyny jednotek se zatím nezměnily.");
  }catch(error){return goWithMessage(request,back,"error",error instanceof Error?error.message:"Účet se nepodařilo přidat.");}
}
