import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { hasAllPropertyAccess, canSeeAll } from "./auth";
import { bankAccountMatches } from "./inbound-bank/bank-email";
import { samePhysicalBankAccount } from "./owner-bank-account";
import {normalizeExpenseAccount} from "./bank-expense-rule-policy";
import {leaseStatusAt} from "./lease-lifecycle-core";
import {payerRecipientUserId,payerRouteLeases} from "./inbound-bank/queue-routing";

export type BankActor = { id: string; role: string; allProperties?: boolean };
export const bankScopeInclude = {
  owner: { select: { userId: true, name: true } },
  propertyLinks: { select: { propertyId: true } },
  unitOwnerships: { select: { unit: { select: { propertyId: true } } } },
  leases: { select: { unit: { select: { propertyId: true } } } },
} satisfies Prisma.OwnerBankAccountInclude;
export type ScopedBankAccount = Prisma.OwnerBankAccountGetPayload<{ include: typeof bankScopeInclude }>;

export function bankScopePropertyIds(account: ScopedBankAccount) {
  return [...new Set([...account.propertyLinks.map(r=>r.propertyId), ...account.unitOwnerships.map(r=>r.unit.propertyId), ...account.leases.map(r=>r.unit.propertyId)])];
}

// A grant for one house must not expose the rest of a shared bank account.
export function managesBankScope(actor: BankActor, accounts: ScopedBankAccount[], editableIds: string[]) {
  if (!accounts.length) return false;
  if (canSeeAll(actor.role)) return true;
  return accounts.every(account => account.owner.userId === actor.id ||
    (bankScopePropertyIds(account).length > 0 && bankScopePropertyIds(account).every(id=>editableIds.includes(id))));
}

export async function bankAccountScopes(actor: BankActor, client: Prisma.TransactionClient | typeof prisma = prisma) {
  const [accounts, grants] = await Promise.all([
    client.ownerBankAccount.findMany({ include: bankScopeInclude }),
    client.userProperty.findMany({ where: { userId: actor.id, permission: { in: ["EDIT","ADMIN"] } }, select: { propertyId: true } }),
  ]);
  const editableIds=grants.map(r=>r.propertyId);
  return accounts.filter(account=>managesBankScope(actor,accounts.filter(other=>samePhysicalBankAccount(account,other)),editableIds));
}

export async function requireInboxBankAccess(actor: BankActor, inboxId: string) {
  const row=await prisma.inboxPayment.findUnique({where:{id:inboxId}});
  if (!row) throw new Error("Bankovní pohyb není dostupný.");
  const scopes=await bankAccountScopes(actor);
  const accounts=scopes.filter(account=>bankAccountMatches(account,row.recipientAccount));
  if (actor.role !== "SUPER_ADMIN" && !accounts.length) {
    const [leases,users]=await Promise.all([payerRouteLeases(),prisma.user.findMany({where:{active:true},select:{id:true}})]);
    if(row.recipientAccount||!row.amountCents||row.amountCents<=0||payerRecipientUserId(row,leases,new Set(users.map(user=>user.id)))!==actor.id)throw new Error("Nemáte oprávnění k tomuto bankovnímu účtu.");
  }
  return { row, accounts };
}

export async function requireBankRuleAccount(actor: BankActor, accountId: string) {
  const accounts=await bankAccountScopes(actor);
  const account=accounts.find(a=>a.id===accountId && a.active);
  if (!account) throw new Error("Nemáte oprávnění spravovat pravidla tohoto účtu.");
  return account;
}

export async function requireInboxLeaseTarget(actor: BankActor, row: { recipientAccount: string|null; counterpartyAccount?:string|null }, leaseId: string) {
  const lease=await prisma.lease.findFirst({where:{id:leaseId,...(hasAllPropertyAccess(actor)?{}:{OR:[
    {ownerBankAccount:{owner:{userId:actor.id}}},
    {unit:{property:{memberships:{some:{userId:actor.id,permission:{in:["EDIT","ADMIN"]}}}}}},
    {unit:{userAccesses:{some:{userId:actor.id,permission:{in:["EDIT","ADMIN"]}}}}},
  ]})},include:{ownerBankAccount:true,unit:true,tenant:true,receiptAccounts:{include:{account:true}}}});
  const knownRecipient=lease&&(bankAccountMatches(lease.ownerBankAccount||{},row.recipientAccount)||lease.receiptAccounts.some(a=>bankAccountMatches(a.account,row.recipientAccount)));
  const knownPayer=lease&&row.recipientAccount==null&&leaseStatusAt(lease)==="ACTIVE"&&Boolean(row.counterpartyAccount)&&[lease.tenantBankAccount,...lease.tenant.payerAccounts].filter((a):a is string=>Boolean(a)).some(a=>normalizeExpenseAccount(a)===normalizeExpenseAccount(row.counterpartyAccount||""));
  if (!lease || (actor.role!=="SUPER_ADMIN" && !knownRecipient&&!knownPayer)) throw new Error("Vybraná smlouva není dostupná pro tento účet.");
  return lease;
}
