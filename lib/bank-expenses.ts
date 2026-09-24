import { Prisma, PropertyCostCategory, PropertyCostKind } from "@prisma/client";
import { serializableTransaction } from "./serializable";
import { expenseAccountIdentity, expenseKinds, bankRemainder, settledCents, type ExpenseKind } from "./bank-expense-values";
import { bankAccountMatches } from "./inbound-bank/bank-email";

export type ExpenseCommand = {
  transactionId:string; sourcePropertyId:string; targetPropertyId:string; userId:string;
  expectedRevision:number; reason:string; amountCents:number; kind:ExpenseKind;
  costId?:string; voidId?:string;
  newCost?: {title:string;amountCents:number;effectiveAt:Date;unitId?:string;kind:PropertyCostKind;category:PropertyCostCategory;vendor?:string;documentNumber?:string};
};
// Both properties must already be authorized by the caller. Account identity is checked again here.
export async function applyExpense(input:ExpenseCommand, client?:Prisma.TransactionClient) {
  if(!input.reason.trim()||input.reason.length>2000)throw new Error("Vyplňte důvod (nejvýše 2 000 znaků).");
  if(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0)throw new Error("Obnovte stránku s aktuální verzí pohybu.");
  const work = async (tx:Prisma.TransactionClient)=>{
    const bank=await tx.bankTransaction.findFirst({where:{id:input.transactionId,bankAccount:{propertyId:input.sourcePropertyId}},include:{bankAccount:true,expenseAllocations:true,allocations:true,securityDepositReceipts:true}});
    if(bank?.expenseIgnoredAt)throw new Error("Nejprve vraťte ignorovaný pohyb do fronty.");
    if(!bank||bank.currency!=="CZK"||!bank.amountCents)throw new Error("Bankovní pohyb nebyl nalezen nebo nemá podporovanou měnu.");
    if(bank.allocations.length||bank.securityDepositReceipts.length)throw new Error("Pohyb již patří k nájmu nebo kauci; nelze jej započítat znovu.");
    if(bank.amountCents>0 && bank.source!=="expense-statement" && !bank.expenseAllocations.length)throw new Error("Vratky importujte výpisem výdajů; příjem nájemného nelze převést automaticky.");
    if(input.targetPropertyId!==input.sourcePropertyId) {
      const links=await tx.propertyPaymentAccount.findMany({where:{propertyId:input.targetPropertyId,active:true,ownerBankAccount:{active:true,ownerId:bank.bankAccount.ownerId||"__none__"}},include:{ownerBankAccount:true}});
      if(!links.some(link=>(bankAccountMatches(link.ownerBankAccount,bank.recipientAccount||bank.bankAccount.iban) || (bank.bankAccount.provider==="expense-statement" && expenseAccountIdentity(link.ownerBankAccount)===bank.bankAccount.externalAccountId))))throw new Error("Cílový dům nemá doloženou vazbu na stejný účet vlastníka.");
    }
    const claim=await tx.bankTransaction.updateMany({where:{id:bank.id,expenseRevision:input.expectedRevision},data:{expenseRevision:{increment:1}}});
    if(claim.count!==1)throw new Error("Pohyb se mezitím změnil. Obnovte stránku.");
    let costId=input.costId||null;
    let eventId:string;
    if(input.voidId) {
      const old=bank.expenseAllocations.find(row=>row.id===input.voidId&&!row.voidedAt&&row.propertyId===input.targetPropertyId);
      if(!old)throw new Error("Aktivní přiřazení nebylo nalezeno.");
      if(old.propertyCostId&&old.kind==="COST_PAYMENT") {
        const rows=await tx.bankExpenseAllocation.findMany({where:{propertyCostId:old.propertyCostId,voidedAt:null}});
        if(settledCents(rows)-old.amountCents<0)throw new Error("Nejprve opravte navazující vratku dodavatele.");
      }
      costId=old.propertyCostId;
      await tx.bankExpenseAllocation.update({where:{id:old.id},data:{voidedAt:new Date(),voidedById:input.userId,voidReason:input.reason}});
      eventId=old.id;
    } else {
      if(!Object.hasOwn(expenseKinds,input.kind)||!Number.isSafeInteger(input.amountCents)||input.amountCents<=0||input.amountCents>bankRemainder(bank.amountCents,bank.expenseAllocations))throw new Error("Částka musí být kladná a nepřesáhnout nerozdělený zbytek pohybu.");
      if((input.kind==="COST_PAYMENT"&&bank.amountCents>0)||(input.kind==="COST_REFUND"&&bank.amountCents<0))throw new Error("Směr pohybu neodpovídá úhradě nebo vratce.");
      if(bank.amountCents>0&&!['COST_REFUND','TRANSFER','OTHER'].includes(input.kind))throw new Error("Příchozí pohyb lze zařadit jako vratku, převod nebo jiný pohyb.");
      if(input.newCost) {
        const n=input.newCost;
        if(input.kind!=="COST_PAYMENT"||costId||!n.title.trim()||!Number.isSafeInteger(n.amountCents)||n.amountCents<input.amountCents||n.amountCents>2147483647||!Number.isFinite(n.effectiveAt.getTime())||!Object.values(PropertyCostKind).includes(n.kind)||!Object.values(PropertyCostCategory).includes(n.category))throw new Error("Zkontrolujte nový náklad, jeho částku, datum a klasifikaci.");
        if(n.unitId&&!await tx.unit.findFirst({where:{id:n.unitId,propertyId:input.targetPropertyId}}))throw new Error("Jednotka nepatří do cílového domu.");
        if(n.documentNumber?.trim() && await tx.propertyCost.findFirst({where:{propertyId:input.targetPropertyId,documentNumber:{equals:n.documentNumber.trim(),mode:"insensitive"},...(n.vendor?.trim()?{OR:[{vendor:{equals:n.vendor.trim(),mode:"insensitive"}},{vendor:null}]}:{})},select:{id:true}}))throw new Error("Faktura s tímto číslem je již evidovaná. Připojte úhradu k existujícímu nákladu.");
        const cost=await tx.propertyCost.create({data:{propertyId:input.targetPropertyId,title:n.title,amountCents:n.amountCents,effectiveAt:n.effectiveAt,kind:n.kind,category:n.category,status:"COMMITTED",unitId:n.unitId||null,vendor:n.vendor,documentNumber:n.documentNumber,allocations:n.unitId?{create:{unitId:n.unitId,shareBasisPoints:10000,amountCents:n.amountCents}}:undefined}});
        costId=cost.id;
        await tx.auditLog.create({data:{userId:input.userId,propertyId:input.targetPropertyId,action:"PROPERTY_COST_CREATED",entityType:"PropertyCost",entityId:costId,details:{reason:input.reason,sourceTransactionId:bank.id}}});
      }
      const isCost=input.kind==="COST_PAYMENT"||input.kind==="COST_REFUND";
      if(isCost!==Boolean(costId))throw new Error("Vyberte náklad pouze pro úhradu nebo vratku dodavatele.");
      if(costId) {
        const cost=await tx.propertyCost.findFirst({where:{id:costId,propertyId:input.targetPropertyId},include:{bankSettlements:true}});
        if(!cost)throw new Error("Náklad nepatří do cílového domu.");
        if(cost.status==="PLANNED")throw new Error("Nejprve potvrďte náklad jako objednaný nebo skutečný.");
        const paid=settledCents(cost.bankSettlements);
        if(input.kind==="COST_PAYMENT"&&paid+input.amountCents>cost.amountCents)throw new Error("Úhrada by překročila zbývající závazek nákladu.");
        if(input.kind==="COST_REFUND"&&input.amountCents>paid)throw new Error("Vratka převyšuje doložené úhrady nákladu.");
      }
      const entry=await tx.bankExpenseAllocation.create({data:{transactionId:bank.id,propertyCostId:costId,propertyId:input.targetPropertyId,kind:input.kind,amountCents:input.amountCents,reason:input.reason,createdById:input.userId}});
      eventId=entry.id;
    }
    if(costId)await tx.propertyCost.update({where:{id:costId},data:{annualReviewStatus:"DRAFT",annualReviewedAt:null,annualReviewedById:null,annualReviewNote:null}});
    await tx.auditLog.create({data:{userId:input.userId,propertyId:input.targetPropertyId,action:input.voidId?"BANK_EXPENSE_VOIDED":"BANK_EXPENSE_ALLOCATED",entityType:"BankTransaction",entityId:bank.id,details:{allocationId:eventId,costId,reason:input.reason,kind:input.kind,amountCents:input.amountCents}}});
    // Expense state is derived from the ledger; rental match status is never used as proof of payment.
    await tx.bankTransaction.update({where:{id:bank.id},data:{status:"IGNORED",suggestedLeaseId:null,matchNote:"Bankovní výdaje: stav a zůstatek jsou v evidenci úhrad nákladů."}});
    return {costId};
  };
  return client ? work(client) : serializableTransaction(work);
}
