import { serializableTransaction } from "@/lib/serializable";
import { PropertyCostCategory, PropertyCostKind } from "@prisma/client";
import { requireManagedProperty } from "@/lib/management";
import { goWithMessage } from "@/lib/route-response";
import { applyExpense } from "@/lib/bank-expenses";
import { expenseMoney, type ExpenseKind } from "@/lib/bank-expense-values";

export async function POST(request:Request,{params}:{params:Promise<{id:string;transactionId:string}>}) {
  const {id,transactionId}=await params,back=`/nemovitosti/${id}/bankovni-vydaje`;
  const access=await requireManagedProperty(id);
  if(!access)return goWithMessage(request,back,"error","Nemáte oprávnění upravovat výdaje.");
  try {
    const form=await request.formData(),get=(key:string)=>String(form.get(key)||"").trim();
    if(["ignore","restore"].includes(get("operation"))) {
      if(!get("reason")||get("reason").length>2000)throw new Error("Vyplňte důvod.");
      await serializableTransaction(async tx=>{
        const bank=await tx.bankTransaction.findFirst({where:{id:transactionId,bankAccount:{propertyId:id}},include:{expenseAllocations:true,allocations:true,securityDepositReceipts:true}});
        if(!bank||bank.expenseRevision!==Number(get("revision")))throw new Error("Pohyb se změnil. Obnovte stránku.");
        if(bank.allocations.length||bank.securityDepositReceipts.length||bank.expenseAllocations.some(a=>!a.voidedAt))throw new Error("Přiřazený pohyb nelze ignorovat.");
        if(bank.amountCents>0&&bank.source!=="expense-statement")throw new Error("Příjem nájemného sem nepatří.");
        const ignored=get("operation")==="ignore";
        await tx.bankTransaction.update({where:{id:transactionId},data:{expenseIgnoredAt:ignored?new Date():null,expenseIgnoreReason:ignored?get("reason"):null,expenseSuggestedRuleId:null,expenseRevision:{increment:1}}});
        await tx.auditLog.create({data:{userId:access.user.id,propertyId:id,action:ignored?"BANK_EXPENSE_IGNORED":"BANK_EXPENSE_RESTORED",entityType:"BankTransaction",entityId:transactionId,details:{reason:get("reason")}}});
      });
      return goWithMessage(request,back,"ok","Stav pohybu uložen; historie zůstává zachována.");
    }
    const targetPropertyId=get("targetPropertyId")||id;
    if(!await requireManagedProperty(targetPropertyId))throw new Error("Nemáte oprávnění upravovat náklady cílového domu.");
    const mode=get("mode"),voidId=get("voidId");
    const result=await applyExpense({transactionId,sourcePropertyId:id,targetPropertyId,userId:access.user.id,expectedRevision:Number(get("revision")),reason:get("reason"),kind:get("kind") as ExpenseKind,amountCents:voidId?0:expenseMoney(get("amount")),costId:get("costId")||undefined,voidId:voidId||undefined,newCost:mode==="create"?{title:get("title"),amountCents:expenseMoney(get("costAmount")),effectiveAt:new Date(`${get("effectiveAt")}T12:00:00Z`),unitId:get("unitId")||undefined,kind:get("costKind") as PropertyCostKind,category:get("category") as PropertyCostCategory,vendor:get("vendor"),documentNumber:get("documentNumber")}:undefined});
    return goWithMessage(request,mode==="create"&&result.costId?`/nemovitosti/${targetPropertyId}/naklady/${result.costId}`:back,"ok",mode==="create"?"Návrh nákladu a úhrada byly uloženy. Přiložte doklad, ověřte rozdělení a potvrďte skutečnost.":voidId?"Přiřazení stornováno; historie zůstala zachována.":"Pohyb byl přiřazen. Zůstatky jsou aktualizované.");
  }catch(error){return goWithMessage(request,back,"error",error instanceof Error?error.message:"Přiřazení se nezdařilo.");}
}
