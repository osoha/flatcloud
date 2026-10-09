import {prisma} from "@/lib/db";
import {bankAccountScopes,bankScopeInclude,bankScopePropertyIds,type BankActor} from "@/lib/account-banking-access";
import {bankAccountMatches} from "./bank-email";
import {inboxRecipientUserId,payerRecipientUserId,payerRouteLeases,transactionRecipientUserId} from "./queue-routing";

/** The navigation and portfolio KPI use the same recipient rule as the queue. */
export async function unmatchedQueueCount(actor:BankActor,propertyIds?:string[],ownerId?:string) {
  if (propertyIds && !propertyIds.length) return 0;
  const [accounts,users,properties,inbox,transactions,scopes,payerLeases,grants]=await Promise.all([
    prisma.ownerBankAccount.findMany({where:{active:true},include:bankScopeInclude}),
    prisma.user.findMany({where:{active:true},select:{id:true}}),
    prisma.property.findMany({select:{id:true,managerId:true}}),
    prisma.inboxPayment.findMany({where:{status:{in:["RECEIVED","UNMATCHED","ERROR"]}},select:{recipientAccount:true,counterpartyAccount:true,amountCents:true,propertyId:true}}),
    prisma.bankTransaction.findMany({where:{amountCents:{gt:0},status:{in:["UNMATCHED","SUGGESTED"]},...(propertyIds?{bankAccount:{propertyId:{in:propertyIds}}}:{})},select:{bankAccount:{select:{ownerId:true,owner:{select:{userId:true}},property:{select:{id:true,managerId:true}}}}}}),
    actor.role==="SUPER_ADMIN"?Promise.resolve([]):bankAccountScopes(actor),
    payerRouteLeases(),
    prisma.userProperty.findMany({where:{permission:{in:["EDIT","ADMIN"]}},select:{propertyId:true,userId:true}}),
  ]);
  const activeIds=new Set(users.map(row=>row.id)),managers=new Map(properties.map(row=>[row.id,row.managerId])),editableGrants=new Set(grants.map(row=>`${row.propertyId}:${row.userId}`));
  const transactionCount=transactions.filter(row=>{if(ownerId&&row.bankAccount.ownerId!==ownerId)return false;const recipient=transactionRecipientUserId(row,activeIds,editableGrants);return actor.role==="SUPER_ADMIN"?!recipient:recipient===actor.id;}).length;
  const inboxCount=inbox.filter(row=>{
    const matches=accounts.filter(account=>bankAccountMatches(account,row.recipientAccount));
    if(ownerId&&!matches.some(account=>account.ownerId===ownerId))return false;
    if(propertyIds?.length&&row.propertyId&&!propertyIds.includes(row.propertyId))return false;
    if(propertyIds?.length&&!row.propertyId&&matches.length&&matches.every(account=>!bankScopePropertyIds(account).some(id=>propertyIds.includes(id))))return false;
    const payer=!row.recipientAccount&&row.amountCents&&row.amountCents>0?payerRecipientUserId(row,payerLeases,activeIds):null;
    const recipient=inboxRecipientUserId(row,accounts,activeIds,managers,editableGrants)||payer;
    return actor.role==="SUPER_ADMIN"?!recipient:recipient===actor.id&&(scopes.some(account=>bankAccountMatches(account,row.recipientAccount))||payer===actor.id);
  }).length;
  return transactionCount+inboxCount;
}
