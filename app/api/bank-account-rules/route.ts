import { currentUser } from "@/lib/auth";
import { createAccountBankRule } from "@/lib/account-bank-rules";
import { text } from "@/lib/forms";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request) {
  const user=await currentUser(); if (!user) return go(request,"/login");
  let returnTo="/platby/banka/pravidla";
  try {
    const form=await request.formData();
    const sourceId=text(form,"sourceId");
    const accountId=text(form,"accountId",true)!;
    returnTo=`/platby/banka/pravidla?account=${encodeURIComponent(accountId)}${sourceId?`&inbox=${encodeURIComponent(sourceId)}`:""}`;
    const direction=text(form,"direction",true)!;
    const amountText=text(form,"amount");
    const amount=amountText==null?null:Number(amountText.replace(",","."));
    if (amount!=null && (!Number.isFinite(amount) || amount<=0 || Math.abs(amount*100-Math.round(amount*100))>0.00001)) throw new Error("Zadejte kladnou částku nejvýše na dvě desetinná místa.");
    await createAccountBankRule(user,{accountId,sourceId,name:text(form,"name",true)!,action:text(form,"action",true)!,direction,currency:text(form,"currency",true)!,counterpartyAccount:text(form,"counterpartyAccount"),counterpartyNameContains:text(form,"counterpartyNameContains"),variableSymbol:text(form,"variableSymbol"),messageContains:text(form,"messageContains"),amountCents:amount==null?null:Math.round(amount*100)*(direction==="OUT"?-1:1),targetLeaseId:text(form,"targetLeaseId")});
    return goWithMessage(request,`/platby/banka/pravidla?account=${encodeURIComponent(accountId)}`,"ok","Pravidlo účtu bylo uloženo. Použije se na nové důvěryhodné bankovní pohyby; minulá zaúčtování se nemění.");
  } catch(error) { return goWithMessage(request,returnTo,"error",error instanceof Error?error.message:"Pravidlo se nepodařilo uložit."); }
}
