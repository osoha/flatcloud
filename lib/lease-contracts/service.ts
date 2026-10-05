import { prisma } from "../db";
import { previewContext } from "../auth";
import { portalEditableUnitWhere } from "../tenant-portal-access";
import { CONTRACT_TEMPLATE_VERSION, addYear } from "./core";

export async function contractActor() {const context=await previewContext();return context.requested||!context.actor||context.actor.role==="TENANT"?null:context.actor;}
export async function contractLease(actor:NonNullable<Awaited<ReturnType<typeof contractActor>>>,leaseId:string){return prisma.lease.findFirst({where:{id:leaseId,unit:portalEditableUnitWhere(actor)},include:{tenant:true,parties:{where:{role:"CONTRACTING_PARTY"},include:{tenant:true}},unit:{include:{property:{include:{owner:true,manager:true}}}},ownerBankAccount:true,paymentItems:{where:{active:true},orderBy:{sortOrder:"asc"}},securityDepositTerms:{orderBy:{effectiveFrom:"desc"}},landlordPeriods:{where:{active:true},include:{owner:true},orderBy:{fromPeriod:"desc"}}}});}
export function contractPrefill(lease:NonNullable<Awaited<ReturnType<typeof contractLease>>>) {
  const iso=(d:Date|null|undefined)=>d?d.toISOString().slice(0,10):"";
  const start=iso(lease.startDate),end=iso(lease.endDate),owner=lease.landlordPeriods.find(p=>p.fromPeriod<=start.slice(0,7)&&(!p.toPeriod||p.toPeriod>=start.slice(0,7)))?.owner;
  const tenants=[lease.tenant,...lease.parties.map(p=>p.tenant)].filter((t,i,a)=>a.findIndex(v=>v.id===t.id)===i);
  const companyTenant=tenants.some(t=>t.type==="COMPANY");
  const terms=lease.securityDepositTerms.find(t=>t.effectiveFrom<=lease.startDate);
  const services=lease.paymentItems.filter(p=>["WATER","HEATING","ELECTRICITY","SERVICES"].includes(p.category)&&p.validFrom<=lease.startDate&&(!p.validTo||p.validTo>=lease.startDate));
  const manager=lease.unit.property.manager;
  return {companyTenant,version:CONTRACT_TEMPLATE_VERSION,initial:{
    term:!end?"INDEFINITE":end<addYear(start)?"SHORT_FIXED":"LONG_FIXED",tenancy:tenants.length>1?"JOINT":"SINGLE",
    landlord:{type:owner?.type==="PERSON"?"PERSON":"COMPANY",name:owner?.name||"",identifier:owner?.ico||"",address:owner?.address||"",email:owner?.email||"",phone:owner?.phone||"",registry:"",signer:"",authority:"",represented:false},
    tenants:tenants.map(t=>({name:t.name,birthDate:iso(t.dateOfBirth),address:t.permanentAddress||t.address||"",deliveryAddress:t.correspondenceAddress||t.permanentAddress||t.address||"",email:t.communicationEmail||t.email||"",phone:t.phone||""})),
    manager:{name:manager?.name||"",email:manager?.email||"",phone:manager?.phone||""},
    unit:{address:[lease.unit.property.address,lease.unit.property.postalCode,lease.unit.property.city].filter(Boolean).join(", "),label:lease.unit.label,floor:lease.unit.floor===null?"":String(lease.unit.floor),disposition:lease.unit.dispositionCustom||lease.unit.disposition||"",areaM2:lease.unit.areaM2||0,cadastral:"",accessories:""},
    startDate:start,endDate:end,handoverDate:start,signingDate:"",signingPlace:lease.unit.property.city||"",rentCents:lease.rentCents,
    services:services.length?services.map(s=>({name:s.name,amountCents:s.amountCents})):lease.servicesCents?[{name:"Zálohy na služby – doplňte rozpis",amountCents:lease.servicesCents}]:[],dueDay:lease.dueDay,account:lease.ownerBankAccount?.iban||[lease.ownerBankAccount?.accountNumber,lease.ownerBankAccount?.bankCode].filter(Boolean).join("/"),variableSymbol:lease.variableSymbol||"",firstPaymentDate:"",depositCents:terms?.agreedAmountCents??lease.depositCents,depositDueDate:"",depositAnnualRateBps:terms?.annualRateBps??null,directEnergy:"",occupantCount:tenants.length,attachments:"",confirmed:false,
  }};
}
