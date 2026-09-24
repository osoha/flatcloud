export const expenseKinds = {
  COST_PAYMENT: "Úhrada nákladu", COST_REFUND: "Vratka dodavatele",
  ADVANCE: "Záloha dodavateli", TRANSFER: "Převod mezi vlastními účty",
  DEPOSIT_REFUND: "Vrácení kauce", LOAN_PRINCIPAL: "Jistina úvěru", OTHER: "Jiný pohyb",
} as const;
export type ExpenseKind = keyof typeof expenseKinds;
export function expenseMoney(value: string) {
  const normalized = value.trim().replace(/[\s\u00a0]/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) throw new Error("Částka musí být číslo s nejvýše dvěma desetinnými místy.");
  const cents = Math.round(Number(normalized) * 100);
  if (!Number.isSafeInteger(cents) || Math.abs(cents) > 2147483647) throw new Error("Částka je mimo podporovaný rozsah.");
  return cents;
}
export function settledCents(rows: Array<{kind:string; amountCents:number; voidedAt:Date|null}>) {
  return rows.filter(row => !row.voidedAt).reduce((sum,row) => sum + (row.kind === "COST_PAYMENT" ? row.amountCents : row.kind === "COST_REFUND" ? -row.amountCents : 0), 0);
}
export function bankRemainder(amountCents:number, rows:Array<{amountCents:number;voidedAt:Date|null}>) {
  return Math.abs(amountCents) - rows.filter(row => !row.voidedAt).reduce((sum,row) => sum + row.amountCents,0);
}
// Semicolon CSV with quoted fields, escaped quotes, CRLF and multiline descriptions.
export function parseExpenseStatement(input:string) {
  if (input.length > 2_000_000) throw new Error("Výpis může mít nejvýše 2 MB.");
  const rows:string[][]=[]; let row:string[]=[], field="", quoted=false, closed=false;
  const source=input.replace(/^\uFEFF/, "").replace(/\r\n/g,"\n");
  for(let i=0;i<=source.length;i++) {
    const c=source[i];
    if(quoted) { if(c===undefined) throw new Error("Neuzavřené uvozovky v CSV."); if(c==='"') {if(source[i+1]==='"'){field+='"';i++;}else {quoted=false;closed=true;}} else field+=c; continue; }
    if(c==='"' && !field && !closed){quoted=true;continue;}
    if(c===';'||c==='\n'||c===undefined){row.push(field);field="";closed=false;if(c!==';'){if(row.some(Boolean))rows.push(row);row=[];}continue;}
    if(closed||c==='"')throw new Error("Neplatné uvozovky v CSV.");field+=c;
  }
  const header=rows.shift()?.map(x=>x.trim());
  const required=["id","datum","castka","mena","protistrana","ucet","vs","zprava"];
  if(!header || header.join(';')!==required.join(';'))throw new Error(`Použijte hlavičku: ${required.join(';')}`);
  if(!rows.length||rows.length>1000)throw new Error("Výpis musí obsahovat 1 až 1 000 pohybů.");
  const ids=new Set<string>();
  return rows.map((cells,index)=>{
    if(cells.length!==8)throw new Error(`Řádek ${index+2}: očekáváno 8 sloupců.`);
    const [externalId,day,amount,currency,counterpartyName,counterpartyIban,variableSymbol,message]=cells.map(x=>x.trim());
    if(!externalId||externalId.length>150||ids.has(externalId))throw new Error(`Řádek ${index+2}: chybějící nebo opakované ID transakce.`);ids.add(externalId);
    const bookedAt=new Date(`${day}T12:00:00Z`);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(bookedAt.getTime())||bookedAt.toISOString().slice(0,10)!==day)throw new Error(`Řádek ${index+2}: neplatné datum YYYY-MM-DD.`);
    const amountCents=expenseMoney(amount);
    if(!amountCents||currency!=='CZK')throw new Error(`Řádek ${index+2}: pouze nenulové pohyby v CZK.`);
    if(cells.some(x=>x.length>2000))throw new Error("Příliš dlouhá hodnota CSV.");
    return {externalId,bookedAt,amountCents,currency,counterpartyName,counterpartyIban,variableSymbol,message};
  });
}

// Canonical Czech account identity: domestic and IBAN notation resolve to one ledger.
export function expenseAccountIdentity(account:{iban?:string|null;accountNumber?:string|null;bankCode?:string|null}) {
  const iban=(account.iban||"").replace(/\s/g,"").toUpperCase();
  let raw=account.accountNumber&&account.bankCode?`${account.accountNumber}/${account.bankCode}`:"";
  if(/^CZ\d{22}$/.test(iban))raw=`${iban.slice(8,14)}-${iban.slice(14)}/${iban.slice(4,8)}`;
  const match=raw.replace(/\s/g,"").match(/^(?:(\d{1,6})-)?(\d{1,10})\/(\d{4})$/);
  if(!match)throw new Error("Import vyžaduje české číslo účtu nebo český IBAN.");
  const prefix=(match[1]||"").replace(/^0+/,""),number=match[2].replace(/^0+/,"")||"0";
  return `${prefix?prefix+"-":""}${number}/${match[3]}`;
}
