import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { hasAllPropertyAccess } from "./auth";
import { bankAccountMatches } from "./inbound-bank/bank-email";
import { samePhysicalBankAccount } from "./owner-bank-account";

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
  if (hasAllPropertyAccess(actor)) return true;
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
  if (actor.role !== "SUPER_ADMIN" && !accounts.length) throw new Error("Nemáte oprávnění k tomuto bankovnímu účtu.");
  return { row, accounts };
}

export async function requireBankRuleAccount(actor: BankActor, accountId: string) {
  const accounts=await bankAccountScopes(actor);
  const account=accounts.find(a=>a.id===accountId && a.active);
  if (!account) throw new Error("Nemáte oprávnění spravovat pravidla tohoto účtu.");
  return account;
}

export async function requireInboxLeaseTarget(actor: BankActor, row: { recipientAccount: string|null }, leaseId: string) {
  const lease=await prisma.lease.findFirst({where:{id:leaseId,unit:hasAllPropertyAccess(actor)?{}:{OR:[
    {property:{memberships:{some:{userId:actor.id,permission:{in:["EDIT","ADMIN"]}}}}},
    {userAccesses:{some:{userId:actor.id,permission:{in:["EDIT","ADMIN"]}}}},
  ]}},include:{ownerBankAccount:true,unit:true}});
  if (!lease || (actor.role!=="SUPER_ADMIN" && !bankAccountMatches(lease.ownerBankAccount || {},row.recipientAccount))) throw new Error("Vybraná smlouva není dostupná pro tento účet.");
  return lease;
}
