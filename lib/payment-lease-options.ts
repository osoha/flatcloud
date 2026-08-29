import { type Prisma } from "@prisma/client";
import { editableUnitWhere } from "./access";
import { prisma } from "./db";
import { leaseStatuses } from "./labels";
import { leaseStatusAt } from "./lease-lifecycle-core";

type Actor={id:string;role:string;allProperties?:boolean};

export async function loadEditablePaymentLeases(actor:Actor,propertyId?:string,client:Prisma.TransactionClient|typeof prisma=prisma){
  const leases=await client.lease.findMany({where:{unit:editableUnitWhere(actor,propertyId)},include:{tenant:true,unit:{include:{property:true}},charges:{where:{active:true},include:{allocations:true,securityDepositOffsets:true,creditApplications:true},orderBy:{dueDate:"asc"}}}});
  return leases.sort((a,b)=>a.unit.property.name.localeCompare(b.unit.property.name,"cs")||a.unit.label.localeCompare(b.unit.label,"cs")||b.startDate.getTime()-a.startDate.getTime());
}

export function paymentLeaseOptionLabel(lease:{contractNumber:string|null;variableSymbol:string;startDate:Date;endDate:Date|null;cancelledAt:Date|null;terminatedOn:Date|null;unit:{label:string;property:{name:string}};tenant:{name:string}}){
  const contract=lease.contractNumber?`Smlouva ${lease.contractNumber} · `:"";
  return `${lease.unit.property.name} · ${lease.unit.label} · ${lease.tenant.name} · ${contract}VS ${lease.variableSymbol} · ${leaseStatuses[leaseStatusAt(lease)]}`;
}
