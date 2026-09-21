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
    const targetPropertyId=get("targetPropertyId")||id;
    if(!await requireManagedProperty(targetPropertyId))throw new Error("Nemáte oprávnění upravovat náklady cílového domu.");
    const mode=get("mode"),voidId=get("voidId");
    const result=await applyExpense({transactionId,sourcePropertyId:id,targetPropertyId,userId:access.user.id,expectedRevision:Number(get("revision")),reason:get("reason"),kind:get("kind") as ExpenseKind,amountCents:voidId?0:expenseMoney(get("amount")),costId:get("costId")||undefined,voidId:voidId||undefined,newCost:mode==="create"?{title:get("title"),amountCents:expenseMoney(get("costAmount")),effectiveAt:new Date(`${get("effectiveAt")}T12:00:00Z`),unitId:get("unitId")||undefined,kind:get("costKind") as PropertyCostKind,category:get("category") as PropertyCostCategory,vendor:get("vendor"),documentNumber:get("documentNumber")}:undefined});
    return goWithMessage(request,mode==="create"&&result.costId?`/nemovitosti/${targetPropertyId}/naklady/${result.costId}`:back,"ok",mode==="create"?"Návrh nákladu a úhrada byly uloženy. Přiložte doklad, ověřte rozdělení a potvrďte skutečnost.":voidId?"Přiřazení stornováno; historie zůstala zachována.":"Pohyb byl přiřazen. Zůstatky jsou aktualizované.");
  }catch(error){return goWithMessage(request,back,"error",error instanceof Error?error.message:"Přiřazení se nezdařilo.");}
}
