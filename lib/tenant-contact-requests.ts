import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { activeTenantLease, portalEditableUnitWhere } from "./tenant-portal-access";
import { checkSubscriptionWrite } from "./subscriptions/service";
import { serializableTransaction } from "./serializable";
import { leaseStatusAt } from "./lease-lifecycle-core";
import { enqueueTenantTaskNotification } from "./tenant-portal-notifications";
import { portalContactPropertyInclude, portalContactOwnerSelect, tenantPortalContact } from "./tenant-portal-contact";

export type TenantContactSnapshot = { email: string | null; phone: string | null; correspondenceAddress: string | null };
type ContactActor = { id: string; role: string; allProperties?: boolean };
export const contactChangeLabels = { email: "Kontaktní e-mail", phone: "Telefon", correspondenceAddress: "Korespondenční adresa" };
export const contactRequestStatusLabels: Record<string, string> = { PENDING: "Čeká na převzetí", ACKNOWLEDGED: "Převzato k vyřízení", REJECTED: "Zamítnuto" };
const contactKeys = ["email", "phone", "correspondenceAddress"] as const;

async function contactSubmissionTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>) {
  try { return await serializableTransaction(work); }
  catch (error) {
    // A concurrent retry may win the unique submission key before this transaction.
    // Re-enter authorization and payload validation once, then return the original request.
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return serializableTransaction(work);
    throw error;
  }
}

export function tenantContactSnapshot(tenant: { email: string | null; communicationEmail: string | null; phone: string | null; correspondenceAddress: string | null }): TenantContactSnapshot {
  return { email: tenant.communicationEmail || tenant.email, phone: tenant.phone, correspondenceAddress: tenant.correspondenceAddress };
}

/** Only the reported fields enter the immutable request; no identity is changed here. */
export function parseTenantContactChange(value: unknown, before: TenantContactSnapshot) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Vyplňte nové kontaktní údaje.");
  const input = value as Record<string, unknown>, requested: Partial<TenantContactSnapshot> = {};
  for (const key of contactKeys) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
    if (typeof input[key] !== "string") throw new Error(`Vyplňte položku ${contactChangeLabels[key].toLowerCase()}.`);
    const raw = input[key].trim(), next = key === "email" ? raw.toLowerCase() : raw;
    if (key === "email" && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next) || next.length > 254)) throw new Error("Zadejte platný kontaktní e-mail.");
    if (key === "phone" && (next.length > 40 || (next && (!/^[+\d() .\/-]{5,40}$/.test(next) || next.replace(/\D/g, "").length < 5)))) throw new Error("Zadejte platné telefonní číslo.");
    if (key === "correspondenceAddress" && next.length > 500) throw new Error("Adresa může mít nejvýše 500 znaků.");
    const previous = key === "email" ? before[key]?.trim().toLowerCase() : before[key]?.trim();
    if ((next || null) !== (previous || null)) requested[key] = next || null;
  }
  if (!Object.keys(requested).length) throw new Error("Uveďte alespoň jeden kontaktní údaj, který se změnil.");
  if (input.reason !== undefined && typeof input.reason !== "string") throw new Error("Doplňující zpráva není platná.");
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (reason.length > 1000) throw new Error("Doplňující zpráva může mít nejvýše 1 000 znaků.");
  return { requested, reason: reason || null };
}

export function contactSnapshotFromJson(value: Prisma.JsonValue): Partial<TenantContactSnapshot> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(contactKeys.filter(key => Object.prototype.hasOwnProperty.call(value, key) && (typeof value[key] === "string" || value[key] === null)).map(key => [key, value[key]]));
}

const requestSelect = {
  id: true, taskId: true, status: true, before: true, requested: true, reason: true,
  createdAt: true, updatedAt: true, reviewedAt: true, reviewNote: true,
} as const;

export async function tenantContactRequests(user: ContactActor, tenantId: string, leaseId: string, preview = false) {
  return serializableTransaction(async tx => {
    if (preview && user.role === "TENANT") throw new Error("Náhled není dostupný.");
    const lease = preview
      ? await tx.lease.findFirst({ where: { id: leaseId, unit: portalEditableUnitWhere(user), OR: [{ tenantId }, { parties: { some: { tenantId, role: "CONTRACTING_PARTY" } } }] }, include: { unit: true } })
      : await activeTenantLease(user.id, tenantId, leaseId, tx);
    if (!lease || leaseStatusAt(lease) !== "ACTIVE" || (!preview && user.role === "SUPER_ADMIN")) throw new Error("K tomuto nájemnímu vztahu nemáte přístup.");
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const requests = await tx.tenantContactChangeRequest.findMany({
      where: { task: { tenantId, leaseId, unitId: lease.unitId, propertyId: lease.unit.propertyId, tenantPortalRequest: true, tenantPortalRequestKind: "CONTACT_CHANGE" } },
      select: requestSelect, orderBy: { createdAt: "desc" }, take: 30,
    });
    return { currentContact: tenantContactSnapshot(tenant), requests };
  });
}

export async function createTenantContactRequest(user: ContactActor, tenantId: string, leaseId: string, input: unknown) {
  if (!input || typeof input !== "object" || !("submissionKey" in input) || typeof input.submissionKey !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.submissionKey)) throw new Error("Obnovte formulář a odešlete nahlášení znovu.");
  const dedupeKey = `tenant-contact:${user.id}:${input.submissionKey}`;
  return contactSubmissionTransaction(async tx => {
    const lease = await activeTenantLease(user.id, tenantId, leaseId, tx);
    if (!lease || !lease.unit.property.active || user.role === "SUPER_ADMIN") throw new Error("K tomuto nájemnímu vztahu nemáte přístup.");
    const subscription=await checkSubscriptionWrite(user,{propertyId:lease.unit.propertyId,unitId:lease.unitId},tx);
    if(!subscription.allowed)throw new Error(subscription.message||"Správa má dočasně pozastavené předplatné.");
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    if (!tenant.active) throw new Error("K tomuto nájemnímu vztahu nemáte přístup.");
    const existing = await tx.task.findUnique({ where: { dedupeKey }, select: { tenantId: true, leaseId: true, contactChangeRequest: { select: requestSelect } } });
    if (existing) {
      if (existing.tenantId !== tenantId || existing.leaseId !== leaseId || !existing.contactChangeRequest) throw new Error("Požadavek se změnil. Obnovte formulář.");
      const repeated = parseTenantContactChange(input, contactSnapshotFromJson(existing.contactChangeRequest.before) as TenantContactSnapshot);
      if (JSON.stringify(repeated.requested) !== JSON.stringify(contactSnapshotFromJson(existing.contactChangeRequest.requested)) || repeated.reason !== existing.contactChangeRequest.reason) throw new Error("Tento formulář už byl odeslán. Pro další změnu otevřete nový formulář.");
      return existing.contactChangeRequest;
    }
    const before = tenantContactSnapshot(tenant), { requested, reason } = parseTenantContactChange(input, before);
    if (await tx.tenantContactChangeRequest.findFirst({ where: { status: "PENDING", task: { tenantId, leaseId } }, select: { id: true } })) throw new Error("Předchozí nahlášení už čeká u správce. Další informace můžete doplnit v jeho konverzaci.");
    const taskId = randomUUID(), title = "Změna kontaktních údajů";
    const body = `Nahlášena změna: ${Object.keys(requested).map(key => contactChangeLabels[key as keyof TenantContactSnapshot]).join(", ")}. Správce údaje ověří a dohodne další postup.${reason ? `\n\n${reason}` : ""}`;
    const contactLease = await tx.lease.findUniqueOrThrow({
      where: { id: leaseId },
      include: {
        ownerBankAccount: { include: { owner: { select: portalContactOwnerSelect } } },
        unit: { include: {
          ownerships: { include: { owner: { select: portalContactOwnerSelect } } },
          property: { include: portalContactPropertyInclude },
        } },
      },
    });
    const contact = tenantPortalContact(contactLease);
    await tx.task.create({ data: {
      id: taskId, dedupeKey, title, description: body, tenantPortalTitle: title, tenantPortalBody: body,
      category: "GENERAL", status: "OPEN", tenantPortalRequest: true, tenantPortalRequestKind: "CONTACT_CHANGE",
      propertyId: lease.unit.propertyId, unitId: lease.unitId, leaseId, tenantId, createdById: user.id,
      assigneeId: contact?.user?.id || null,
    } });
    const result = await tx.tenantContactChangeRequest.create({ data: { taskId, requestedById: user.id, before, requested, reason }, select: requestSelect });
    await tx.auditLog.create({ data: {
      userId: user.id, propertyId: lease.unit.propertyId, action: "TENANT_CONTACT_CHANGE_REQUESTED", entityType: "TenantContactChangeRequest", entityId: result.id,
      details: { taskId, tenantId, leaseId, before, requested, reason, requestedAt: result.createdAt.toISOString() },
    } });
    return result;
  });
}

/** Editable exact lease scope, even when the caller has a read-only all-properties grant. */
export async function staffContactRequest(user: ContactActor, taskId: string, db: Prisma.TransactionClient = prisma) {
  const task = await db.task.findFirst({
    where: { id: taskId, tenantPortalRequest: true, tenantPortalRequestKind: "CONTACT_CHANGE", lease: { unit: portalEditableUnitWhere(user) } },
    include: { contactChangeRequest: true, tenant: { select: { active: true } }, lease: { select: { unitId: true, tenantId: true, startDate: true, endDate: true, terminatedOn: true, cancelledAt: true, unit: { select: { propertyId: true, property: { select: { active: true } } } }, parties: { select: { tenantId: true, role: true } } } } },
  });
  if (!task?.contactChangeRequest || !task.lease || !task.tenantId || task.unitId !== task.lease.unitId || task.propertyId !== task.lease.unit.propertyId || !(task.tenantId === task.lease.tenantId || task.lease.parties.some(party => party.tenantId === task.tenantId && party.role === "CONTRACTING_PARTY"))) return null;
  return task;
}

export async function reviewTenantContactRequest(user: ContactActor, taskId: string, input: { decision: string; revision: string; reviewNote: string }) {
  if (input.decision !== "ACKNOWLEDGED" && input.decision !== "REJECTED") throw new Error("Vyberte platný způsob vyřízení.");
  const decision = input.decision, reviewNote = input.reviewNote.trim();
  if (reviewNote.length < 5 || reviewNote.length > 2000) throw new Error("Napište nájemníkovi vysvětlení nebo další postup (5 až 2 000 znaků).");
  return serializableTransaction(async tx => {
    const task = await staffContactRequest(user, taskId, tx), request = task?.contactChangeRequest;
    if (!task || !request) throw new Error("Nemáte oprávnění vyřídit toto nahlášení.");
    if (!task.tenant?.active || !task.lease!.unit.property.active || leaseStatusAt(task.lease!) !== "ACTIVE") throw new Error("Nahlášení lze vyřídit pouze u aktivního nájemníka a aktuálního nájmu.");
    if (request.status !== "PENDING" || input.revision !== request.updatedAt.toISOString()) throw new Error("Nahlášení se mezitím změnilo. Obnovte stránku.");
    const reviewedAt = new Date();
    const changed = await tx.tenantContactChangeRequest.updateMany({
      where: { id: request.id, status: "PENDING", updatedAt: request.updatedAt },
      data: { status: decision, reviewNote, reviewedAt, reviewedById: user.id },
    });
    if (changed.count !== 1) throw new Error("Nahlášení se mezitím změnilo. Obnovte stránku.");
    await tx.task.update({ where: { id: taskId }, data: { status: decision === "ACKNOWLEDGED" ? "IN_PROGRESS" : "CANCELLED", closedAt: decision === "ACKNOWLEDGED" ? null : reviewedAt } });
    const body = `${decision === "ACKNOWLEDGED" ? "Změnu kontaktních údajů jsme převzali k vyřízení. Kontakty a přihlášení zatím zůstávají beze změny." : "Nahlášená změna kontaktních údajů byla zamítnuta. Kontakty a přihlášení zůstávají beze změny."}\n\n${reviewNote}`;
    const entry = await tx.taskEntry.create({ data: { taskId, authorId: user.id, kind: "SYSTEM", visibility: "TENANT_VISIBLE", body } });
    await enqueueTenantTaskNotification(tx, { taskId, kind: "REPLY", entryId: entry.id, eventKey: `reply:${entry.id}` });
    await tx.auditLog.create({ data: {
      userId: user.id, propertyId: task.propertyId, action: "TENANT_CONTACT_CHANGE_REVIEWED", entityType: "TenantContactChangeRequest", entityId: request.id,
      details: { taskId, tenantId: task.tenantId, leaseId: task.leaseId, decision, reviewNote, reviewedAt: reviewedAt.toISOString(), profileChanged: false, taskEntryId: entry.id },
    } });
    return { decision, requestId: request.id };
  });
}
