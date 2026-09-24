import { Prisma, BankExpenseRule } from "@prisma/client";
import { prisma } from "./db";
import { serializableTransaction } from "./serializable";
import { expenseRuleMatches } from "./bank-expense-rule-policy";
import { applyExpense } from "./bank-expenses";
import { settledCents, expenseAccountIdentity } from "./bank-expense-values";
import { bankAccountMatches } from "./inbound-bank/bank-email";

export async function expenseRuleAccess(tx:Prisma.TransactionClient,rule:Pick<BankExpenseRule,"sourcePropertyId"|"targetPropertyId"|"bankAccountId"|"unitId">,userId:string) {
  const user=await tx.user.findFirst({where:{id:userId,active:true}});if(!user)throw new Error("Autor pravidla není aktivní.");
  const all=user.allProperties||["SUPER_ADMIN","MANAGER"].includes(user.role);
  for(const id of new Set([rule.sourcePropertyId,rule.targetPropertyId])) {
    if(!await tx.property.findFirst({where:{id,active:true,...(all?{}:{memberships:{some:{userId,permission:{in:["EDIT","ADMIN"]}}}})}}))throw new Error("Chybí oprávnění k domu pravidla.");
  }
  const bank=await tx.bankAccount.findFirst({where:{id:rule.bankAccountId,propertyId:rule.sourcePropertyId}});if(!bank)throw new Error("Účet nepatří zdrojovému domu.");
  if(rule.sourcePropertyId!==rule.targetPropertyId){
    const links=await tx.propertyPaymentAccount.findMany({where:{propertyId:rule.targetPropertyId,active:true,ownerBankAccount:{active:true,ownerId:bank.ownerId||"__none__"}},include:{ownerBankAccount:true}});
    if(!links.some(l=>bankAccountMatches(l.ownerBankAccount,bank.iban)||(bank.provider==="expense-statement"&&expenseAccountIdentity(l.ownerBankAccount)===bank.externalAccountId)))throw new Error("Cílový dům není připojen ke stejnému účtu vlastníka.");
  }
  if(rule.unitId&&!await tx.unit.findFirst({where:{id:rule.unitId,propertyId:rule.targetPropertyId}}))throw new Error("Jednotka nepatří do cílového domu.");
}
// Executed only for freshly imported IDs or a user-confirmed preview; never during GET.
export async function runExpenseRules(sourcePropertyId:string,ids:string[],actorId?:string) {
  let applied=0,review=0;
  if(!await prisma.bankExpenseRule.count({where:{sourcePropertyId,active:true}}))return {applied,review:ids.length};
  for(const id of [...new Set(ids)].slice(0,1000)) {
    try {const changed=await serializableTransaction(async tx=>{
      const bank=await tx.bankTransaction.findFirst({where:{id,bankAccount:{propertyId:sourcePropertyId}},include:{expenseAllocations:true,allocations:true,securityDepositReceipts:true}});
      if(!bank||bank.expenseIgnoredAt||bank.expenseSuggestedRuleId||bank.expenseAllocations.some(a=>!a.voidedAt)||bank.allocations.length||bank.securityDepositReceipts.length)return false;
      const rules=(await tx.bankExpenseRule.findMany({where:{sourcePropertyId,bankAccountId:bank.bankAccountId,active:true}})).filter(r=>expenseRuleMatches(r.conditions,bank));
      // Overlapping rules are ambiguous, including ignore-versus-cost rules.
      if(rules.length!==1)return false;
      const rule=rules[0];await expenseRuleAccess(tx,rule,rule.createdById);
      if(actorId)await expenseRuleAccess(tx,rule,actorId);
      const userId=actorId||rule.createdById,reason=`Pravidlo „${rule.name}“ (${rule.id})`;
      if(rule.action==="CREATE_COST"||rule.action==="MATCH") {
        if(bank.amountCents>=0||bank.currency!=="CZK")return false;
        let costId:string|undefined;
        if(rule.action==="MATCH"){
          if(!bank.variableSymbol)return false;
          const costs=(await tx.propertyCost.findMany({where:{propertyId:rule.targetPropertyId,...(rule.unitId?{unitId:rule.unitId}:{}),documentNumber:bank.variableSymbol,status:{in:["COMMITTED","ACTUAL"]}},include:{bankSettlements:true}})).filter(c=>c.amountCents-settledCents(c.bankSettlements)>=Math.abs(bank.amountCents));
          if(costs.length!==1)return false;costId=costs[0].id;
        }
        await applyExpense({transactionId:id,sourcePropertyId,targetPropertyId:rule.targetPropertyId,userId,expectedRevision:bank.expenseRevision,reason,amountCents:Math.abs(bank.amountCents),kind:"COST_PAYMENT",costId,newCost:rule.action==="CREATE_COST"?{title:rule.name,amountCents:Math.abs(bank.amountCents),effectiveAt:bank.bookedAt,unitId:rule.unitId||undefined,kind:rule.costKind,category:rule.category,vendor:bank.counterpartyName||undefined}:undefined},tx);
      }else if(rule.action!=="IGNORE"&&rule.action!=="ASSIGN")return false;
      await tx.bankTransaction.update({where:{id},data:{expenseSuggestedRuleId:rule.id,...(rule.action==="IGNORE"?{expenseIgnoredAt:new Date(),expenseIgnoreReason:reason,expenseRevision:{increment:1}}:{})}});
      await tx.bankExpenseRule.update({where:{id:rule.id},data:{usedCount:{increment:1},lastUsedAt:new Date()}});
      await tx.auditLog.create({data:{userId,propertyId:sourcePropertyId,action:"BANK_EXPENSE_RULE_APPLIED",entityType:"BankTransaction",entityId:id,details:{ruleId:rule.id,action:rule.action,targetPropertyId:rule.targetPropertyId}}});
      return true;
    });if(changed)applied++;else review++;}catch {review++;}
  }
  return {applied,review};
}
export async function previewExpenseRule(rule:Pick<BankExpenseRule,"sourcePropertyId"|"bankAccountId"|"conditions">) {
  const rows=await prisma.bankTransaction.findMany({where:{bankAccountId:rule.bankAccountId,bankAccount:{propertyId:rule.sourcePropertyId},expenseIgnoredAt:null,expenseSuggestedRuleId:null,expenseAllocations:{none:{voidedAt:null}},allocations:{none:{}},securityDepositReceipts:{none:{}}},orderBy:{bookedAt:"desc"},take:1001});
  return {rows:rows.slice(0,1000).filter(r=>expenseRuleMatches(rule.conditions,r)).map(r=>({id:r.id,date:r.bookedAt.toISOString().slice(0,10),amountCents:r.amountCents,label:r.counterpartyName||r.message||r.externalId})),truncated:rows.length>1000};
}
