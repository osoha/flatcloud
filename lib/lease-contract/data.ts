import {prisma} from "@/lib/db";
import {editableUnitWhere, leaseAccessWhere} from "@/lib/access";
import {businessDateKey} from "@/lib/calendar";
import {contractFactErrors,type ContractFacts} from "./model";
import {isLeaseContractTestRecord,leaseContractPilotEnabled} from "./pilot";

export async function contractPilotData(actor:{id:string;role:string;allProperties?:boolean},leaseId:string) {
  if(!leaseContractPilotEnabled() || actor.role === "TENANT") return null;
  const lease=await prisma.lease.findFirst({where:{id:leaseId,...leaseAccessWhere(actor)},include:{
    tenant:true,parties:true,unit:{include:{property:true}},ownerBankAccount:true,
    paymentItems:{orderBy:{sortOrder:"asc"}},securityDepositTerms:{orderBy:[{effectiveFrom:"desc"},{createdAt:"desc"}]},
  }});
  if(!lease || !isLeaseContractTestRecord(lease)) return null;
  const editable=await prisma.unit.findFirst({where:{id:lease.unitId,...editableUnitWhere(actor,lease.unit.propertyId)},select:{id:true}});
  if(!editable) return null;
  const start=businessDateKey(lease.startDate),end=lease.endDate ? businessDateKey(lease.endDate) : null;
  const activeItems=lease.paymentItems.filter(x=>x.active && businessDateKey(x.validFrom)<=start && (!x.validTo || businessDateKey(x.validTo)>=start));
  const serviceItems=activeItems.filter(x=>["SERVICES","WATER","HEATING","ELECTRICITY"].includes(x.category));
  const rentItems=activeItems.filter(x=>x.category === "RENT");
  const term=lease.securityDepositTerms.find(x=>businessDateKey(x.effectiveFrom)<=start);
  const account=lease.ownerBankAccount;
  const bankAccount=account?.accountNumber && (account.accountNumber.includes("/") || account.bankCode)
    ? account.accountNumber.includes("/") ? account.accountNumber : `${account.accountNumber}/${account.bankCode}`
    : account?.iban || null;
  const facts:ContractFacts={
    tenantName:lease.tenant.name,tenantDateOfBirth:lease.tenant.dateOfBirth?.toISOString().slice(0,10)||null,tenantType:lease.tenant.type,
    unitType:lease.unit.type,unitLabel:lease.unit.label,unitAddress:[lease.unit.property.address,lease.unit.property.city].filter(Boolean).join(", "),areaM2:lease.unit.areaM2,
    startDate:start,endDate:end,dueDay:lease.dueDay,currency:lease.currency,
    rentCents:rentItems.length ? rentItems.reduce((n,x)=>n+x.amountCents,0) : lease.rentCents,
    servicesCents:serviceItems.length ? serviceItems.reduce((n,x)=>n+x.amountCents,0) : lease.servicesCents,
    depositCents:term?.agreedAmountCents ?? lease.depositCents,depositRateBps:term?.annualRateBps ?? null,
    bankAccount,variableSymbol:lease.variableSymbol,
    indexationEnabled:lease.indexationEnabled,contractingParties:Math.max(1,lease.parties.filter(x=>x.role === "CONTRACTING_PARTY").length),
    hasScheduledFinanceChanges:lease.paymentItems.some(x=>x.active && ((businessDateKey(x.validFrom)>start && (!end || businessDateKey(x.validFrom)<=end)) || (x.validTo && businessDateKey(x.validTo)>=start && (!end || businessDateKey(x.validTo)<end)))) || activeItems.some(x=>!["RENT","SERVICES","WATER","HEATING","ELECTRICITY"].includes(x.category)) || lease.securityDepositTerms.some(x=>businessDateKey(x.effectiveFrom)>start && (!end || businessDateKey(x.effectiveFrom)<=end)),
  };
  const errors=contractFactErrors(facts);
  if(lease.parties.some(x=>x.role === "CONTRACTING_PARTY" && x.tenantId !== lease.tenantId)) errors.push("Smluvní strana se liší od hlavního nájemce. Tato varianta vyžaduje samostatnou kontrolu.");
  if(lease.cancelledAt || lease.terminatedOn) errors.push("Zrušená nebo předčasně ukončená smlouva není určena pro tento pilot.");
  return {lease,facts,errors,serviceDefaults:serviceItems.map(x=>({name:x.name,amountCents:x.amountCents}))};
}
