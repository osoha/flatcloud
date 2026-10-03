import { normalizePayerAccount } from "./owner-bank-account";

export type AccountRuleConditions = { direction: string; currency: string; counterpartyAccount: string|null; counterpartyNameContains: string|null; variableSymbol: string|null; messageContains: string|null; amountCents: number|null };
export type AccountRuleMovement = { amountCents: number|null; currency: string; counterpartyAccount: string|null; counterpartyName: string|null; variableSymbol: string|null; message: string|null; subject?: string|null };
const vs=(value:string|null)=>(value||"").replace(/\D/g,"").replace(/^0+(?=\d)/,"");
export function accountBankRuleMatches(rule: AccountRuleConditions, row: AccountRuleMovement) {
  if (row.amountCents==null || row.amountCents===0 || rule.currency!==row.currency) return false;
  if ((rule.direction==="IN" && row.amountCents<0) || (rule.direction==="OUT" && row.amountCents>0)) return false;
  if (rule.counterpartyAccount && normalizePayerAccount(rule.counterpartyAccount)!==normalizePayerAccount(row.counterpartyAccount)) return false;
  if (rule.counterpartyNameContains && !(row.counterpartyName||"").toLocaleLowerCase("cs-CZ").includes(rule.counterpartyNameContains.toLocaleLowerCase("cs-CZ"))) return false;
  if (rule.variableSymbol && vs(rule.variableSymbol)!==vs(row.variableSymbol)) return false;
  if (rule.messageContains && !`${row.message||""} ${row.subject||""}`.toLocaleLowerCase("cs-CZ").includes(rule.messageContains.toLocaleLowerCase("cs-CZ"))) return false;
  return rule.amountCents==null || rule.amountCents===row.amountCents;
}
export function validateAccountRuleConditions(rule: AccountRuleConditions) {
  if ([rule.counterpartyAccount,rule.counterpartyNameContains,rule.messageContains].some(value=>value && value.length>500)) throw new Error("Podmínka pravidla smí mít nejvýše 500 znaků.");
  if (!["IN","OUT"].includes(rule.direction) || !/^[A-Z]{3}$/.test(rule.currency)) throw new Error("Vyberte směr a platnou měnu.");
  if (![rule.counterpartyAccount,rule.counterpartyNameContains,rule.variableSymbol,rule.messageContains].some(Boolean) && rule.amountCents==null) throw new Error("Doplňte alespoň jednu podmínku. Pravidlo nesmí platit pro všechny pohyby účtu.");
  if (rule.variableSymbol && !/^\d{1,10}$/.test(rule.variableSymbol)) throw new Error("VS musí obsahovat nejvýše 10 číslic.");
  if (rule.amountCents!=null && (!Number.isSafeInteger(rule.amountCents) || Math.abs(rule.amountCents)>2147483647 || rule.amountCents===0 || (rule.direction==="IN" ? rule.amountCents<0 : rule.amountCents>0))) throw new Error("Částka neodpovídá směru pohybu.");
}
