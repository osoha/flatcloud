import { bankScopeInclude, bankScopePropertyIds, managesBankScope } from "./account-banking-access";
import { bankAccountMatches } from "./inbound-bank/bank-email";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { bankRemainder } from "./bank-expense-values";
import { hasAllPropertyAccess } from "./auth";

type Client = Prisma.TransactionClient | typeof prisma;

// Assignment never grants access. An uncertain unit stays at whole-property scope.
async function reviewer(propertyId: string | null, client: Client) {
  if (propertyId) {
    const property = await client.property.findUnique({ where: { id: propertyId }, include: {
      manager: true, memberships: { where: { permission: { in: ["EDIT", "ADMIN"] }, user: { active: true } }, include: { user: true } },
    } });
    if (property?.manager?.active && (hasAllPropertyAccess(property.manager) || property.memberships.some(m => m.userId === property.managerId))) return property.managerId;
    if (property?.memberships.length === 1) return property.memberships[0].userId;
  }
  return (await client.user.findFirst({ where: { role: "SUPER_ADMIN", active: true }, orderBy: { id: "asc" }, select: { id: true } }))?.id || null;
}

async function reviewTask(client: Client, input: { key: string; propertyId: string | null; title: string; href: string; reason: string; open: boolean; accountReviewerId?: string|null }) {
  const existing = await client.task.findUnique({ where: { dedupeKey: input.key } });
  if (!input.open) {
    if (existing && !["DONE", "CANCELLED"].includes(existing.status)) await client.task.update({ where: { id: existing.id }, data: {
      status: "DONE", closedAt: new Date(), entries: { create: { kind: "SYSTEM", body: "Bankovní pohyb byl vyřešen. Úkol byl automaticky uzavřen." } },
    } });
    return;
  }
  const assigneeId = input.accountReviewerId !== undefined ? input.accountReviewerId : await reviewer(input.propertyId, client);
  const data = { propertyId: input.propertyId, assigneeId, title: input.title, description: `${input.reason}\n\nOtevřít pohyb: ${input.href}` };
  // Unique key also protects simultaneous mailbox/manual runs from duplicate tasks.
  await client.task.upsert({ where: { dedupeKey: input.key }, create: {
    ...data, dedupeKey: input.key, category: "GENERAL",
  }, update: { ...data, ...(["DONE", "CANCELLED"].includes(existing?.status || "") ? { status: "OPEN", closedAt: null } : {}) } });
}

export async function reconcileInboxReview(inboxId: string, client: Client = prisma) {
  const inbox = await client.inboxPayment.findUnique({ where: { id: inboxId } });
  if (!inbox) return;
  const accounts=(await client.ownerBankAccount.findMany({include:bankScopeInclude})).filter(a=>bankAccountMatches(a,inbox.recipientAccount));
  let accountReviewerId:string|null|undefined=undefined;
  if(accounts.length) {
    // A known account stays with its owner or an editor of the complete account scope.
    const propertyIds=[...new Set(accounts.flatMap(bankScopePropertyIds))];
    const properties=await client.property.findMany({where:{id:{in:propertyIds}},include:{manager:true,memberships:{include:{user:true}}}});
    const candidateIds=[...new Set([...accounts.map(a=>a.owner.userId),...properties.map(p=>p.managerId),...properties.flatMap(p=>p.memberships.filter(m=>["EDIT","ADMIN"].includes(m.permission)).map(m=>m.userId))].filter((id):id is string=>Boolean(id)))];
    const candidates=await client.user.findMany({where:{id:{in:candidateIds},active:true},select:{id:true,role:true,allProperties:true}});
    accountReviewerId=null;
    for(const id of candidateIds) {
      const actor=candidates.find(c=>c.id===id);if(!actor)continue;
      const grants=await client.userProperty.findMany({where:{userId:id,permission:{in:["EDIT","ADMIN"]}},select:{propertyId:true}});
      if(managesBankScope(actor,accounts,grants.map(g=>g.propertyId))) {accountReviewerId=id;break;}
    }
  }
  await reviewTask(client, { key: `bank-review:inbox:${inboxId}`, propertyId: null, title: "Prověřit bankovní notifikaci", href: `/platby/nesparovane/email/${inboxId}`,
    accountReviewerId, reason: inbox.parseNote || "Nelze bezpečně určit směr nebo nemovitost bankovního pohybu.", open: !inbox.transactionId && ["RECEIVED", "UNMATCHED", "ERROR"].includes(inbox.status) });
}

export async function reconcileTransactionReview(transactionId: string, client: Client = prisma) {
  const bank = await client.bankTransaction.findUnique({ where: { id: transactionId }, include: { bankAccount: true, expenseAllocations: true } });
  if (!bank) return;
  const expense = bank.amountCents < 0 || bank.source === "expense-statement";
  const open = expense ? !bank.expenseIgnoredAt && bankRemainder(bank.amountCents, bank.expenseAllocations) > 0 : ["UNMATCHED", "SUGGESTED", "OVERPAYMENT"].includes(bank.status);
  await reviewTask(client, { key: `bank-review:transaction:${transactionId}`, propertyId: bank.bankAccount.propertyId,
    title: expense ? "Přiřadit bankovní výdaj / vratku" : "Dopárovat příchozí platbu",
    href: expense ? `/nemovitosti/${bank.bankAccount.propertyId}/bankovni-vydaje?year=${bank.bookedAt.getUTCFullYear()}&transaction=${transactionId}#pohyb-${transactionId}` : `/nemovitosti/${bank.bankAccount.propertyId}/platby/${transactionId}`,
    reason: expense ? "Přiřaďte pohyb k nákladu, záloze nebo jiné kategorii. Nesouvisející pohyb vyřaďte s důvodem; pro opakované pohyby nastavte pravidlo." : bank.matchNote || "Platba nemá jednoznačné přiřazení.", open });
}
