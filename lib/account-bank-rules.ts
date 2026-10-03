import { createHash } from "node:crypto";
import { prisma } from "./db";
import { accountBankRuleMatches, validateAccountRuleConditions, type AccountRuleConditions } from "./account-bank-rule-policy";
import { bankAccountMatches } from "./inbound-bank/bank-email";
import { normalizePayerAccount, canonicalPaymentIdentity } from "./owner-bank-account";
import { requireBankRuleAccount, requireInboxBankAccess, requireInboxLeaseTarget, type BankActor } from "./account-banking-access";

export async function matchingAccountBankRule(row: Parameters<typeof accountBankRuleMatches>[1] & { recipientAccount: string|null }) {
  const accounts=(await prisma.ownerBankAccount.findMany({where:{active:true}})).filter(a=>bankAccountMatches(a,row.recipientAccount));
  if (!accounts.length) return {rule:null,ambiguous:false};
  const matches=(await prisma.accountBankRule.findMany({where:{ownerBankAccountId:{in:accounts.map(a=>a.id)},active:true},include:{targetLease:{include:{unit:true,ownerBankAccount:true}}},orderBy:[{priority:"asc"},{createdAt:"asc"}]})).filter(r=>accountBankRuleMatches(r,row));
  const first=matches[0];
  const signatures=new Set(matches.filter(r=>r.priority===first?.priority).map(r=>`${r.action}:${r.targetLeaseId||""}`));
  return {rule:signatures.size>1?null:first||null,ambiguous:signatures.size>1};
}

export async function createAccountBankRule(actor: BankActor, input: AccountRuleConditions & { accountId:string; name:string; action:string; targetLeaseId:string|null; sourceId:string|null }) {
  const account=await requireBankRuleAccount(actor,input.accountId);
  if (!input.name.trim() || input.name.length>160) throw new Error("Doplňte název pravidla (nejvýše 160 znaků).");
  const conditions={direction:input.direction,currency:input.currency,counterpartyAccount:input.counterpartyAccount?normalizePayerAccount(input.counterpartyAccount):null,counterpartyNameContains:input.counterpartyNameContains,variableSymbol:input.variableSymbol,messageContains:input.messageContains,amountCents:input.amountCents};
  validateAccountRuleConditions(conditions);
  if (!["IGNORE","MATCH_LEASE","SUGGEST_LEASE"].includes(input.action)) throw new Error("Vyberte akci pravidla.");
  let targetLeaseId:string|null=null;
  if (input.action!=="IGNORE") {
    if (input.direction!=="IN" || input.currency!=="CZK" || !input.targetLeaseId) throw new Error("Ke smlouvě lze párovat pouze příchozí platbu v CZK.");
    const lease=await requireInboxLeaseTarget(actor,{recipientAccount:account.iban || `${account.accountNumber}/${account.bankCode}`},input.targetLeaseId);
    if (!bankAccountMatches(lease.ownerBankAccount||{},account.iban || `${account.accountNumber}/${account.bankCode}`)) throw new Error("Smlouva používá jiný účet.");
    targetLeaseId=lease.id;
  }
  if (input.sourceId) {
    const {row}=await requireInboxBankAccess(actor,input.sourceId);
    if (!bankAccountMatches(account,row.recipientAccount)) throw new Error("Zdrojový pohyb patří jinému účtu.");
    if (!accountBankRuleMatches(conditions,row)) throw new Error("Podmínky pravidla neodpovídají zdrojovému pohybu.");
  }
  const action=input.action as "IGNORE"|"MATCH_LEASE"|"SUGGEST_LEASE";
  const fingerprint=createHash("sha256").update(JSON.stringify({account:canonicalPaymentIdentity(account),action,targetLeaseId,...conditions})).digest("hex");
  return prisma.$transaction(async tx=>{
    const duplicate=await tx.accountBankRule.findUnique({where:{fingerprint}});
    if (duplicate) throw new Error(`Stejné pravidlo již existuje: ${duplicate.name}.`);
    const rule=await tx.accountBankRule.create({data:{fingerprint,ownerBankAccountId:account.id,name:input.name.trim(),action,targetLeaseId,...conditions,createdById:actor.id}});
    await tx.auditLog.create({data:{userId:actor.id,action:"ACCOUNT_BANK_RULE_CREATED",entityType:"AccountBankRule",entityId:rule.id,details:{accountId:account.id,action,targetLeaseId,...conditions,sourceId:input.sourceId}}});
    return rule;
  });
}
