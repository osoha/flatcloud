import {bankAccountMatches} from "./bank-email";
import {normalizeExpenseAccount} from "@/lib/bank-expense-rule-policy";
import {leaseStatusAt} from "@/lib/lease-lifecycle-core";
import {prisma} from "@/lib/db";

type Account = {accountNumber:string|null;bankCode:string|null;iban:string|null;owner:{userId:string|null};propertyLinks:Array<{propertyId:string}>;unitOwnerships:Array<{unit:{propertyId:string}}> ;leases:Array<{unit:{propertyId:string}}>};

/** Ambiguous or unidentified recipients stay with the administrator. */
export function inboxRecipientUserId(row:{recipientAccount:string|null},accounts:Account[],activeUserIds:Set<string>,managers:Map<string,string|null>,editableGrants:Set<string>) {
  const matches=accounts.filter(account=>bankAccountMatches(account,row.recipientAccount));
  if(!matches.length)return null;
  const owners=new Set(matches.map(account=>account.owner.userId).filter((id):id is string=>Boolean(id&&activeUserIds.has(id))));
  if(owners.size){const owner=[...owners][0];return owners.size===1&&matches.every(account=>account.owner.userId===owner)?owner:null;}
  const propertyIds=new Set(matches.flatMap(account=>[
    ...account.propertyLinks.map(row=>row.propertyId),
    ...account.unitOwnerships.map(row=>row.unit.propertyId),
    ...account.leases.map(row=>row.unit.propertyId),
  ]));
  const assigned=new Set([...propertyIds].map(id=>managers.get(id)).filter((id):id is string=>Boolean(id&&activeUserIds.has(id))));
  if(propertyIds.size && [...propertyIds].some(id=>!managers.get(id)||!editableGrants.has(`${id}:${managers.get(id)}`)))return null;
  return assigned.size===1?[...assigned][0]:null;
}

export function transactionRecipientUserId(row:{bankAccount:{owner:{userId:string|null}|null;property:{id:string;managerId:string|null}}},activeUserIds:Set<string>,editableGrants:Set<string>) {
  const ownerId=row.bankAccount.owner?.userId;
  if(ownerId&&activeUserIds.has(ownerId))return ownerId;
  const managerId=row.bankAccount.property.managerId;
  return managerId&&activeUserIds.has(managerId)&&editableGrants.has(`${row.bankAccount.property.id}:${managerId}`)?managerId:null;
}

export type PayerRouteLease={startDate:Date;endDate:Date|null;terminatedOn:Date|null;cancelledAt:Date|null;tenantBankAccount:string|null;tenant:{payerAccounts:string[]};ownerBankAccount:{owner:{userId:string|null}}|null;unit:{property:{managerId:string|null}}};
export async function payerRouteLeases(){return prisma.lease.findMany({select:{startDate:true,endDate:true,terminatedOn:true,cancelledAt:true,tenantBankAccount:true,tenant:{select:{payerAccounts:true}},ownerBankAccount:{select:{owner:{select:{userId:true}}}},unit:{select:{property:{select:{managerId:true}}}}}});}
/** A known payer account can identify one active owner's portfolio when the recipient was omitted. */
export function payerRecipientUserId(row:{counterpartyAccount:string|null},leases:PayerRouteLease[],activeUserIds:Set<string>) {
  const payer=normalizeExpenseAccount(row.counterpartyAccount||"");if(!payer)return null;
  const matches=leases.filter(lease=>leaseStatusAt(lease)==="ACTIVE"&&[lease.tenantBankAccount,...lease.tenant.payerAccounts].filter((value):value is string=>Boolean(value)).some(value=>normalizeExpenseAccount(value)===payer));
  const recipients=new Set(matches.map(lease=>lease.ownerBankAccount?.owner.userId||lease.unit.property.managerId).filter((id):id is string=>Boolean(id&&activeUserIds.has(id))));
  return recipients.size===1?[...recipients][0]:null;
}
