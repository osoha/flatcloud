import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { bankAccountReadScope } from "@/lib/bank-account-permissions";
import { bankAccountScopes } from "@/lib/account-banking-access";
import { go, goWithMessage } from "@/lib/route-response";
export async function POST(request:Request,{params}:{params:Promise<{accountId:string}>}){
 const user=await currentUser();if(!user)return go(request,"/login");const{accountId}=await params;const form=await request.formData(),unitId=String(form.get("returnUnitId")||"");const back=`/bankovni-ucty?accountId=${encodeURIComponent(accountId)}${unitId?`&unitId=${encodeURIComponent(unitId)}`:""}#ucet-${accountId}`;
 try{
  const usageState=String(form.get("usageState")||""),label=String(form.get("label")||"").trim();
  if(!["AVAILABLE","RECEIPTS_ONLY","ARCHIVED"].includes(usageState)||label.length>100)throw new Error("Neplatné údaje účtu.");
  // Renaming/archiving a shared account affects all properties: require complete scope.
  await prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended('flatberry:bank-account-changes',0))`;
   const fullScopes=await bankAccountScopes(user,tx);
   const account=await tx.ownerBankAccount.findFirst({where:{id:accountId,...bankAccountReadScope(user)},include:{owner:true}});
   if(!account||(!["SUPER_ADMIN","MANAGER"].includes(user.role)&&account.owner.userId!==user.id&&!fullScopes.some(a=>a.id===account.id)&&!(account.createdById===user.id&&!await tx.unitOwnership.count({where:{ownerBankAccountId:account.id}})&&!await tx.propertyPaymentAccount.count({where:{ownerBankAccountId:account.id}})&&!await tx.lease.count({where:{ownerBankAccountId:account.id}}))))throw new Error("Změnu společného účtu musí provést vlastník nebo správce celého jeho rozsahu.");
   if(usageState!=="AVAILABLE"&&(await tx.unitOwnership.count({where:{ownerBankAccountId:accountId}})||await tx.lease.count({where:{ownerBankAccountId:accountId,status:{in:["ACTIVE","FUTURE"]}}})||await tx.bankAccountChange.count({where:{accountId,status:{in:["SCHEDULED","BLOCKED"]}}})))throw new Error("Účet je stále vybrán u jednotky nebo plánované změny. Nejdříve změňte jeho použití.");
   await tx.ownerBankAccount.update({where:{id:accountId},data:{label:label||null,usageState,active:true}});
   await tx.auditLog.create({data:{userId:user.id,action:"OWNER_BANK_ACCOUNT_USAGE_CHANGED",entityType:"OwnerBankAccount",entityId:accountId,details:{before:{label:account.label,state:account.usageState},after:{label,usageState}}}});
  });return goWithMessage(request,back,"ok","Nastavení účtu uloženo. Historické vazby a příjem dobíhajících plateb jsou zachovány.");
 }catch(error){return goWithMessage(request,back,"error",error instanceof Error?error.message:"Účet se nepodařilo upravit.");}
}
