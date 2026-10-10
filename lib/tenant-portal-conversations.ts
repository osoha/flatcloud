import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { activeTenantLease } from "./tenant-portal-access";
import { checkSubscriptionWrite } from "./subscriptions/service";
import { portalMessageLease, type PortalMessageUser } from "./tenant-portal-messages";
import { canEditTask } from "./task-access";
import { serializableTransaction } from "./serializable";
import { portalContactPropertyInclude, portalContactOwnerSelect, tenantPortalContact } from "./tenant-portal-contact";
import { enqueueEntryNotifications } from "./task-notifications";
import { leaseStatusAt } from "./lease-lifecycle-core";

export class PortalConversationError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

async function submissionTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>) {
  try { return await serializableTransaction(work); }
  catch (error) {
    // Concurrent identical submissions may hit the unique key before PostgreSQL
    // reports a serialization conflict. Re-enter the authorized idempotency read once.
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return serializableTransaction(work);
    throw error;
  }
}

export function portalSubmissionKey(value: unknown) {
  const key = typeof value === "string" ? value : "";
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(key)) throw new PortalConversationError("Obnovte formulář a zkuste zprávu odeslat znovu.");
  return key;
}

export function portalConversationBody(value: unknown) {
  const body = String(value || "").replace(/\r\n?/g, "\n").trim();
  if (!body || body.length > 5000) throw new PortalConversationError("Napište zprávu o délce 1 až 5 000 znaků.");
  return body;
}

/** Only this explicit public boundary is used by the tenant API. */
export function portalConversationWhere(tenantId: string, leaseId: string, scope: { unitId: string; propertyId: string }): Prisma.TaskWhereInput {
  return { tenantId, leaseId, ...scope, OR: [
    { tenantPortalRequest: true },
    { tenantPortalPublishedAt: { not: null }, tenantPortalTitle: { not: null }, tenantPortalBody: { not: null } },
  ] };
}

const publicTaskSelect = {
  id: true, tenantPortalTitle: true, tenantPortalBody: true, tenantPortalRequest: true,
  tenantPortalRequestKind: true, tenantPortalPublishedAt: true, status: true, createdAt: true, updatedAt: true,
  createdById: true, createdBy: { select: { name: true } },
  tenantPortalPublishedBy: { select: { name: true } },
  tenant: { select: { active: true } }, property: { select: { active: true } },
} satisfies Prisma.TaskSelect;
type PublicTask = Prisma.TaskGetPayload<{ select: typeof publicTaskSelect }>;

function publicConversation(task: PublicTask, preview: boolean) {
  return {
    id: task.id,
    // Legacy defect records without a snapshot must never fall back to editable staff descriptions.
    title: task.tenantPortalTitle || "Hlášení z portálu",
    body: task.tenantPortalBody || "Hlášení bylo předáno správci.",
    kind: task.tenantPortalRequestKind || (task.tenantPortalRequest ? "DEFECT" : "TASK"),
    status: task.status,
    createdAt: (task.tenantPortalPublishedAt || task.createdAt).toISOString(), updatedAt: task.updatedAt.toISOString(),
    authorName: task.tenantPortalRequest ? task.createdBy?.name || "Nájemník" : task.tenantPortalPublishedBy?.name || "Správa domu",
    isTenant: task.tenantPortalRequest,
    canReply: !preview && Boolean(task.tenant?.active && task.property?.active) && !["DONE", "CANCELLED"].includes(task.status),
  };
}

async function conversationLease(tx: Prisma.TransactionClient, user: PortalMessageUser, tenantId: string, leaseId: string, preview: boolean) {
  if (preview) {
    if (user.role === "TENANT") throw new PortalConversationError("Náhled není dostupný.", 403);
    return portalMessageLease(user, tenantId, leaseId, true, tx);
  }
  if (user.role === "SUPER_ADMIN") throw new PortalConversationError("Tato akce není dostupná v administrátorském náhledu.", 403);
  return activeTenantLease(user.id, tenantId, leaseId, tx);
}

export async function tenantPortalConversations(user: PortalMessageUser, tenantId: string, leaseId: string, preview = false) {
  return serializableTransaction(async tx => {
    const lease = await conversationLease(tx, user, tenantId, leaseId, preview);
    if (!lease) throw new PortalConversationError("K tomuto nájemnímu vztahu nemáte přístup.", 403);
    const tasks = await tx.task.findMany({
      where: portalConversationWhere(tenantId, leaseId, { unitId: lease.unitId, propertyId: lease.unit.propertyId }),
      select: publicTaskSelect, orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    });
    return tasks.map(task => publicConversation(task, preview));
  });
}

async function authorizedConversation(tx: Prisma.TransactionClient, user: PortalMessageUser, tenantId: string, taskId: string, preview = false) {
  const target = await tx.task.findUnique({ where: { id: taskId }, select: { leaseId: true } });
  if (!target?.leaseId) throw new PortalConversationError("Konverzace nebyla nalezena.", 404);
  const lease = await conversationLease(tx, user, tenantId, target.leaseId, preview);
  if (!lease) throw new PortalConversationError("Konverzace nebyla nalezena.", 404);
  const task = await tx.task.findFirst({
    where: { id: taskId, ...portalConversationWhere(tenantId, lease.id, { unitId: lease.unitId, propertyId: lease.unit.propertyId }) },
    select: { ...publicTaskSelect, assigneeId: true, propertyId: true, leaseId: true, unitId: true },
  });
  if (!task) throw new PortalConversationError("Konverzace nebyla nalezena.", 404);
  return task;
}

export async function tenantPortalConversation(user: PortalMessageUser, tenantId: string, taskId: string, preview = false) {
  return serializableTransaction(async tx => {
    const task = await authorizedConversation(tx, user, tenantId, taskId, preview);
    const [entries, attachments] = await Promise.all([
      tx.taskEntry.findMany({ where: { taskId, visibility: "TENANT_VISIBLE" }, select: { id: true, body: true, authorId: true, author: { select: { name: true, role: true } }, createdAt: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
      // Only the tenant's original defect photos: later unscoped/internal task attachments are excluded.
      tx.taskAttachment.findMany({ where: { taskId, taskEntryId: null, uploadedById: task.createdById || "", task: { tenantPortalRequest: true } }, select: { id: true, fileAsset: { select: { originalName: true, mimeType: true } } }, orderBy: { createdAt: "asc" } }),
    ]);
    return {
      ...publicConversation(task, preview),
      entries: entries.map(entry => ({ id: entry.id, body: entry.body, authorName: entry.author?.name || "Správa domu", isTenant: entry.author?.role === "TENANT" || entry.authorId === task.createdById && task.tenantPortalRequest, createdAt: entry.createdAt.toISOString(), attachments: [] })),
      attachments: attachments.map(attachment => ({ id: attachment.id, title: attachment.fileAsset.originalName, mimeType: attachment.fileAsset.mimeType, url: `/api/portal/tenants/${encodeURIComponent(tenantId)}/conversations/${encodeURIComponent(taskId)}/attachments/${encodeURIComponent(attachment.id)}${preview ? "?preview=1" : ""}` })),
    };
  });
}

/** No generic task membership or role grants are created for the tenant. */
export async function createTenantPortalConversation(user: PortalMessageUser, tenantId: string, input: { leaseId: string; title: string; body: string; submissionKey: string }) {
  const title = input.title.trim(), body = portalConversationBody(input.body), key = portalSubmissionKey(input.submissionKey);
  if (title.length < 3 || title.length > 140) throw new PortalConversationError("Vyplňte předmět zprávy o délce 3 až 140 znaků.");
  if (user.role === "SUPER_ADMIN") throw new PortalConversationError("Tato akce není dostupná v administrátorském náhledu.", 403);
  return submissionTransaction(async tx => {
    const lease = await activeTenantLease(user.id, tenantId, input.leaseId, tx);
    if (!lease) throw new PortalConversationError("K tomuto nájemnímu vztahu nemáte přístup.", 403);
    const subscription=await checkSubscriptionWrite(user,{propertyId:lease.unit.propertyId,unitId:lease.unitId},tx);
    if(!subscription.allowed)throw new PortalConversationError(subscription.message||"Správa má dočasně pozastavené předplatné.",403);
    if (!lease.unit.property.active || !await tx.tenant.count({ where: { id: tenantId, active: true } })) throw new PortalConversationError("Zprávu lze odeslat pouze u aktivního bydlení.", 403);
    const dedupeKey = `tenant-message:${user.id}:${tenantId}:${lease.id}:${key}`;
    const previous = await tx.task.findUnique({ where: { dedupeKey }, select: { id: true, tenantPortalTitle: true, tenantPortalBody: true } });
    if (previous) {
      if (previous.tenantPortalTitle !== title || previous.tenantPortalBody !== body) throw new PortalConversationError("Tento formulář už byl odeslán. Pro další zprávu otevřete nový formulář.", 409);
      return { taskId: previous.id, created: false };
    }
    // The assignee must match the actual manager/owner card, never an unrelated building owner.
    const contactLease = await tx.lease.findUniqueOrThrow({ where: { id: lease.id }, include: { ownerBankAccount: { include: { owner: { select: portalContactOwnerSelect } } }, unit: { include: { ownerships: { include: { owner: { select: portalContactOwnerSelect } } }, property: { include: portalContactPropertyInclude } } } } });
    const contact = tenantPortalContact(contactLease);
    const taskId = randomUUID();
    const task = await tx.task.create({ data: { id: taskId, title, description: body, tenantPortalTitle: title, tenantPortalBody: body, tenantPortalRequest: true, tenantPortalRequestKind: "MESSAGE", category: "GENERAL", status: "OPEN", propertyId: lease.unit.propertyId, unitId: lease.unitId, leaseId: lease.id, tenantId, createdById: user.id, assigneeId: contact?.user?.id || null, dedupeKey } });
    await tx.auditLog.create({ data: { userId: user.id, propertyId: lease.unit.propertyId, action: "TENANT_MESSAGE_SENT", entityType: "Task", entityId: task.id, details: { tenantId, leaseId: lease.id } } });
    return { taskId: task.id, created: true };
  });
}

export async function replyToTenantPortalConversation(user: PortalMessageUser, tenantId: string, taskId: string, input: { body: string; submissionKey: string }) {
  const body = portalConversationBody(input.body), key = portalSubmissionKey(input.submissionKey);
  return submissionTransaction(async tx => {
    const task = await authorizedConversation(tx, user, tenantId, taskId);
    const subscription=await checkSubscriptionWrite(user,{...(task.propertyId?{propertyId:task.propertyId}:{}),...(task.unitId?{unitId:task.unitId}:{})},tx);
    if(!subscription.allowed)throw new PortalConversationError(subscription.message||"Správa má dočasně pozastavené předplatné.",403);
    if (!task.tenant?.active || !task.property?.active) throw new PortalConversationError("Zprávu lze odeslat pouze u aktivního bydlení.", 403);
    const tenantSubmissionKey = `tenant-reply:${user.id}:${tenantId}:${taskId}:${key}`;
    const existing = await tx.taskEntry.findUnique({ where: { tenantSubmissionKey }, select: { id: true, body: true } });
    if (existing) {
      if (existing.body !== body) throw new PortalConversationError("Tato zpráva už byla odeslána. Pro další odpověď obnovte formulář.", 409);
      return { entryId: existing.id, created: false };
    }
    if (["DONE", "CANCELLED"].includes(task.status)) throw new PortalConversationError("Tato konverzace je uzavřená. Pokud potřebujete něco doplnit, napište novou zprávu.", 409);
    const entry = await tx.taskEntry.create({ data: { taskId, authorId: user.id, body, kind: "COMMENT", visibility: "TENANT_VISIBLE", tenantSubmissionKey } });
    await enqueueEntryNotifications(tx, { taskId, entryId: entry.id, authorId: user.id, visibility: "TENANT_VISIBLE", mentionedIds: [], recipientIds: task.assigneeId ? [task.assigneeId] : [] });
    await tx.task.update({ where: { id: taskId }, data: { updatedAt: new Date() } });
    await tx.auditLog.create({ data: { userId: user.id, propertyId: task.propertyId, action: "TENANT_MESSAGE_REPLY", entityType: "TaskEntry", entityId: entry.id, details: { taskId, tenantId, leaseId: task.leaseId } } });
    return { entryId: entry.id, created: true };
  });
}

/** Staff opt-in publication is revalidated inside the same transaction as the reply. */
export async function validateStaffTenantReply(tx: Prisma.TransactionClient, user: { id: string; role: string; allProperties?: boolean }, task: { id: string; tenantPortalRequest: boolean; tenantPortalPublishedAt: Date | null; tenantPortalTitle: string | null; tenantPortalBody: string | null; tenantId: string | null; leaseId: string | null; unitId: string | null; propertyId: string | null; status: string }) {
  if (user.role === "TENANT" || !await canEditTask({ ...user, allProperties: false }, task, tx)) throw new Error("Nemáte oprávnění odpovídat nájemníkovi.");
  if (!task.tenantId || !task.leaseId || !task.unitId || !task.propertyId || !(task.tenantPortalRequest || task.tenantPortalPublishedAt && task.tenantPortalTitle && task.tenantPortalBody)) throw new Error("Tento úkol nemá konverzaci s nájemníkem.");
  const lease = await tx.lease.findFirst({ where: { id: task.leaseId, unitId: task.unitId, unit: { propertyId: task.propertyId, property: { active: true } }, OR: [{ tenantId: task.tenantId }, { parties: { some: { tenantId: task.tenantId, role: "CONTRACTING_PARTY" } } }] } });
  if (!lease || leaseStatusAt(lease) !== "ACTIVE") throw new Error("Konverzace vyžaduje aktuální nájemní vztah.");
  if (!await tx.tenant.count({ where: { id: task.tenantId, active: true } })) throw new Error("Nájemník již není aktivní.");
  if (["DONE", "CANCELLED"].includes(task.status)) throw new Error("Nejprve znovu otevřete uzavřenou konverzaci.");
}

export async function tenantPortalConversationAttachment(user: PortalMessageUser, tenantId: string, taskId: string, attachmentId: string, preview = false) {
  return serializableTransaction(async tx => {
    const task = await authorizedConversation(tx, user, tenantId, taskId, preview);
    return tx.taskAttachment.findFirst({ where: { id: attachmentId, taskId, taskEntryId: null, uploadedById: task.createdById || "", task: { tenantPortalRequest: true } }, select: { fileAsset: { select: { storageKey: true, mimeType: true, originalName: true } } } });
  });
}
