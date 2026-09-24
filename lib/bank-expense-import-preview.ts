import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { normalizeExpenseAccount } from "./bank-expense-rule-policy";
import { parseExpenseStatement } from "./bank-expense-values";
type Records=ReturnType<typeof parseExpenseStatement>;
export async function expenseImportPreview(tx:Prisma.TransactionClient,records:Records,identity:string,ownerId:string) {
 const accounts=(await tx.bankAccount.findMany({where:{ownerId},select:{id:true,iban:true,externalAccountId:true,provider:true}})).filter(a=>normalizeExpenseAccount(a.iban||"")===identity||(a.provider==="expense-statement"&&a.externalAccountId===identity));
 const earliest=new Date(Math.min(...records.map(r=>r.bookedAt.getTime()))-86400000),latest=new Date(Math.max(...records.map(r=>r.bookedAt.getTime()))+86400000);
 const existing=await tx.bankTransaction.findMany({where:{bankAccountId:{in:accounts.map(a=>a.id)},OR:[{bookedAt:{gte:earliest,lte:latest}},{externalId:{in:records.map(r=>r.externalId)}}]},select:{id:true,bankAccountId:true,externalId:true,bookedAt:true,amountCents:true,currency:true,counterpartyIban:true,counterpartyName:true,variableSymbol:true,message:true}});
 const ledger=accounts.find(a=>a.provider==="expense-statement");
 const results=records.map((r,index)=>{
  const same=existing.find(e=>e.bankAccountId===ledger?.id&&e.externalId===r.externalId);
  if(same){const identical=["amountCents","currency","counterpartyIban","counterpartyName","variableSymbol","message"].every(k=>same[k as keyof typeof same]===r[k as keyof typeof r])&&same.bookedAt.getTime()===r.bookedAt.getTime();return {id:r.externalId,state:identical?"duplicate":"conflict",matches:[same.id]};}
  const similar=(e:typeof records[number])=>e.amountCents===r.amountCents&&e.currency===r.currency&&e.bookedAt.toISOString().slice(0,10)===r.bookedAt.toISOString().slice(0,10)&&((r.counterpartyIban&&normalizeExpenseAccount(e.counterpartyIban||"")===normalizeExpenseAccount(r.counterpartyIban))||(r.variableSymbol&&r.variableSymbol===e.variableSymbol)||(r.counterpartyName&&r.counterpartyName.toLowerCase()===(e.counterpartyName||"").toLowerCase()));
  const matches=existing.filter(e=>similar({...e,counterpartyIban:e.counterpartyIban||"",counterpartyName:e.counterpartyName||"",variableSymbol:e.variableSymbol||"",message:e.message||""})).map(e=>e.id);
  for(const previous of records.slice(0,index))if(similar(previous))matches.push("file:"+previous.externalId);
  return {id:r.externalId,state:matches.length?"suspect":"new",matches:matches.sort()};
 });
 const token=createHash("sha256").update(JSON.stringify({identity,ownerId,records,results})).digest("hex");
 return {token,rows:results.map((r,i)=>({id:r.id,state:r.state,date:records[i].bookedAt.toISOString().slice(0,10),amountCents:records[i].amountCents,label:records[i].counterpartyName||records[i].message,possibleMatches:r.matches.length}))};
}
