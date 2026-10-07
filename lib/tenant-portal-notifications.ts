import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { businessDateKey, businessDateKeyToInstant, businessDateEndInstant, type BusinessDateKey } from "./calendar";
import { leaseStatusAt } from "./lease-lifecycle-core";
import { tenantPortalContactMatches } from "./tenant-portal-access";
import { portalAnnouncementAudience } from "./tenant-portal-messages";
import { sendMail, escapeHtml, type MailInput } from "./email";
import { taskStatuses } from "./labels";
import { serializableTransaction } from "./serializable";

type Client = Prisma.TransactionClient;
export type TenantNotificationKind = "TASK_PUBLISHED" | "REPLY" | "STATUS" | "DUE_SOON" | "OVERDUE" | "CONTACT_RESOLVED" | "ANNOUNCEMENT" | "BANK_ACCOUNT_CHANGE";
const leaseSelect = { id: true, tenantId: true, unitId: true, startDate: true, endDate: true, terminatedOn: true, cancelledAt: true, parties: { select: { tenantId: true, role: true } }, unit: { select: { propertyId: true, property: { select: { active: true } } } } } satisfies Prisma.LeaseSelect;
const taskSelect = { id: true, tenantId: true, leaseId: true, unitId: true, propertyId: true, tenantPortalRequest: true, tenantPortalPublishedAt: true, tenantPortalTitle: true, tenantPortalBody: true, dueAt: true, status: true, updatedAt: true } satisfies Prisma.TaskSelect;

type Lease = Prisma.LeaseGetPayload<{ select: typeof leaseSelect }>;
function activeContract(lease: Lease | null, tenantId: string, now: Date, future = false) {
  return Boolean(lease && lease.unit.property.active && (leaseStatusAt(lease, now) === "ACTIVE" || future && leaseStatusAt(lease, now) === "FUTURE") && (lease.tenantId === tenantId || lease.parties.some(p => p.tenantId === tenantId && p.role === "CONTRACTING_PARTY")));
}
function publicTask(task: Prisma.TaskGetPayload<{ select: typeof taskSelect }>) {
  return Boolean(task.tenantPortalTitle && task.tenantPortalBody && (task.tenantPortalRequest || task.tenantPortalPublishedAt));
}
async function recipients(client: Client, tenantId: string, excludeUserId?: string) {
  const accesses = await client.tenantPortalAccess.findMany({ where: { tenantId, user: { active: true }, tenant: { active: true }, ...(excludeUserId ? { userId: { not: excludeUserId } } : {}) }, select: { user: { select: { id: true, email: true } }, tenant: { select: { email: true, communicationEmail: true } } } });
  return accesses.filter(access => tenantPortalContactMatches(access.user.email, access.tenant)).map(access => access.user);
}

/** Durable operational mail. Call inside the same transaction as the public event. */
export async function enqueueTenantTaskNotification(client: Client, input: { taskId: string; kind: Exclude<TenantNotificationKind, "ANNOUNCEMENT" | "BANK_ACCOUNT_CHANGE">; eventKey: string; entryId?: string; sourceRevision?: Date; contactRequestId?: string; excludeUserId?: string }, now = new Date()) {
  if (input.kind === "REPLY" && !input.entryId) return 0;
  const task = await client.task.findUnique({ where: { id: input.taskId }, select: taskSelect });
  if (!task?.leaseId || !task.tenantId || !task.propertyId || !task.unitId || !publicTask(task)) return 0;
  const lease = await client.lease.findUnique({ where: { id: task.leaseId }, select: leaseSelect });
  if (!activeContract(lease, task.tenantId, now) || lease!.unitId !== task.unitId || lease!.unit.propertyId !== task.propertyId) return 0;
  if (input.entryId && !await client.taskEntry.count({ where: { id: input.entryId, taskId: task.id, visibility: "TENANT_VISIBLE" } })) return 0;
  await client.tenantPortalNotificationSnapshot.upsert({ where: { taskId: task.id }, create: { taskId: task.id, status: task.status, dueAt: task.dueAt, publishedAt: task.tenantPortalPublishedAt, observedAt: task.updatedAt, trackingSince: now }, update: {} });
  const people = await recipients(client, task.tenantId, input.excludeUserId);
  if (!people.length) return 0;
  const result = await client.tenantPortalNotification.createMany({ data: people.map(user => ({ id: randomUUID(), dedupeKey: `${input.eventKey}:${user.id}`, userId: user.id, tenantId: task.tenantId!, leaseId: lease!.id, propertyId: task.propertyId!, kind: input.kind, taskId: task.id, entryId: input.entryId, contactRequestId: input.contactRequestId, sourceRevision: input.sourceRevision })), skipDuplicates: true });
  return result.count;
}

/** Only explicit publications opt in. Existing announcements retain a NULL revision. */
export async function publishTenantAnnouncementNotification(client: Client, announcementId: string, now = new Date()) {
  await client.announcement.update({ where: { id: announcementId }, data: { tenantPortalNotificationRevision: now, tenantPortalNotificationQueuedAt: null } });
  return queueTenantAnnouncementNotification(client, announcementId, now);
}
async function queueTenantAnnouncementNotification(client: Client, announcementId: string, now: Date) {
  const item = await client.announcement.findUnique({ where: { id: announcementId }, include: { audiences: true } });
  if (!item?.active || !item.tenantPortalNotificationRevision || item.tenantPortalNotificationQueuedAt || item.startsAt > now || item.expiresAt && item.expiresAt <= now) return 0;
  const leaseIds = item.audiences.filter(a => a.kind === "TENANT_LEASE" && a.leaseId).map(a => a.leaseId!);
  const propertyIds = item.audiences.filter(a => a.kind === "TENANT_PROPERTY" && a.propertyId).map(a => a.propertyId!);
  if (!leaseIds.length && !propertyIds.length) return 0;
  const leases = await client.lease.findMany({ where: { OR: [{ id: { in: leaseIds } }, { unit: { propertyId: { in: propertyIds } } }] }, select: leaseSelect, orderBy: { id: "asc" } });
  const bankNotice=item.id.startsWith("bank-change:")?await client.bankAccountNotice.findUnique({where:{announcementId:item.id},select:{tenantIds:true}}):null;
  let queued = 0;
  for (const lease of leases) {
    const tenants = new Set(bankNotice?.tenantIds || [lease.tenantId, ...lease.parties.filter(p => p.role === "CONTRACTING_PARTY").map(p => p.tenantId)]);
    for (const tenantId of tenants) {
      if (bankNotice ? !lease.unit.property.active || !bankNotice.tenantIds.includes(tenantId) : !activeContract(lease, tenantId, now)) continue;
      const people = await recipients(client, tenantId);
      if (!people.length) continue;
      const result = await client.tenantPortalNotification.createMany({ data: people.map(user => ({ id: randomUUID(), dedupeKey: `announcement:${item.id}:${item.tenantPortalNotificationRevision!.toISOString()}:${user.id}`, userId: user.id, tenantId, leaseId: lease.id, propertyId: lease.unit.propertyId, kind: item.id.startsWith("bank-change:") ? "BANK_ACCOUNT_CHANGE" : "ANNOUNCEMENT", announcementId: item.id, sourceRevision: item.tenantPortalNotificationRevision })), skipDuplicates: true });
      queued += result.count;
    }
  }
  await client.announcement.update({ where: { id: item.id }, data: { tenantPortalNotificationQueuedAt: now } });
  return queued;
}

/** First observation establishes a baseline; deploy never emits old status changes or old announcements. */
export async function collectTenantPortalNotifications(now = new Date()) {
  const announcements = await prisma.announcement.findMany({ where: { active: true, startsAt: { lte: now }, tenantPortalNotificationRevision: { not: null }, tenantPortalNotificationQueuedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, select: { id: true }, take: 100, orderBy: [{ startsAt: "asc" }, { id: "asc" }] });
  for (const item of announcements) await serializableTransaction(tx => queueTenantAnnouncementNotification(tx, item.id, now));
  const changed = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT t."id" FROM "Task" t LEFT JOIN "TenantPortalNotificationSnapshot" s ON s."taskId"=t."id"
    WHERE (t."tenantPortalRequest"=true OR t."tenantPortalPublishedAt" IS NOT NULL)
      AND (s."taskId" IS NULL OR t."updatedAt">s."observedAt")
    ORDER BY t."updatedAt", t."id" LIMIT 250`;
  for (const { id } of changed) await serializableTransaction(async tx => {
    const task = await tx.task.findUnique({ where: { id }, select: taskSelect });
    if (!task) return;
    const previous = await tx.tenantPortalNotificationSnapshot.findUnique({ where: { taskId: id } });
    if (previous && (previous.status !== task.status || previous.dueAt?.getTime() !== task.dueAt?.getTime()) && publicTask(task)) await enqueueTenantTaskNotification(tx, { taskId: id, kind: "STATUS", eventKey: `status:${id}:${task.updatedAt.toISOString()}`, sourceRevision: task.updatedAt }, now);
    const data = { status: task.status, dueAt: task.dueAt, publishedAt: task.tenantPortalPublishedAt, observedAt: task.updatedAt };
    await tx.tenantPortalNotificationSnapshot.upsert({ where: { taskId: id }, create: { taskId: id, ...data, trackingSince: now }, update: data });
  });
  const shiftedDay = (days: number) => { const day = new Date(`${businessDateKey(now)}T12:00:00Z`); day.setUTCDate(day.getUTCDate() + days); return day.toISOString().slice(0, 10) as BusinessDateKey; };
  const deadlines = await prisma.task.findMany({ where: { OR: [{ tenantPortalRequest: true }, { tenantPortalPublishedAt: { not: null } }], status: { notIn: ["DONE", "CANCELLED"] }, dueAt: { gte: businessDateKeyToInstant(shiftedDay(-1)), lte: businessDateEndInstant(shiftedDay(1)) } }, select: taskSelect });
  for (const task of deadlines) {
    const snapshot = await prisma.tenantPortalNotificationSnapshot.findUnique({ where: { taskId: task.id } });
    if (!task.dueAt || !snapshot || businessDateKey(task.dueAt) < businessDateKey(snapshot.trackingSince)) continue;
    const kind = businessDateKey(task.dueAt) < businessDateKey(now) ? "OVERDUE" : "DUE_SOON";
    await enqueueTenantTaskNotification(prisma, { taskId: task.id, kind, eventKey: `deadline:${task.id}:${task.dueAt.toISOString()}:${kind}`, sourceRevision: task.dueAt }, now);
  }
  return { observed: changed.length, announcements: announcements.length };
}

const subjects: Record<TenantNotificationKind, string> = { TASK_PUBLISHED: "Nový úkol od správce", REPLY: "Nová zpráva od správce", STATUS: "Aktualizace vašeho požadavku", DUE_SOON: "Blíží se termín úkolu", OVERDUE: "Připomenutí termínu úkolu", CONTACT_RESOLVED: "Vyřízení změny kontaktních údajů", ANNOUNCEMENT: "Nové oznámení pro váš domov", BANK_ACCOUNT_CHANGE: "Změna platebních údajů" };
export function tenantMailSafety(input: { email: string; isTestIdentity: boolean; origin: string; branch?: string; externalUrl?: string }) {
  const url = new URL(input.origin);
  if (input.branch?.startsWith("sandbox/") || url.hostname.includes("sandbox") || input.externalUrl?.includes("sandbox") || input.isTestIdentity || /\.(test|invalid)$/i.test(input.email)) return "Testovací prostředí nebo testovací příjemce: e-mail neodeslán.";
  if (url.protocol !== "https:") return "Pro odesílání chybí bezpečná HTTPS adresa aplikace.";
  return null;
}
export function tenantDeliveryFailure(error: unknown, attempts: number): "RETRY" | "FAILED" | "UNKNOWN" {
  const smtp = error as { code?: string; responseCode?: number; command?: string };
  const rejected = typeof smtp?.responseCode === "number" && smtp.responseCode >= 400;
  const beforeDelivery = ["ECONNECTION", "EDNS", "EAUTH"].includes(smtp?.code || "") || smtp?.command === "CONN";
  return rejected || beforeDelivery ? smtp?.code === "EAUTH" || (smtp?.responseCode || 0) >= 500 || attempts >= 3 ? "FAILED" : "RETRY" : "UNKNOWN";
}

/** SMTP is injectable for verification. No opt-out applies to tenant operational messages. */
export async function processTenantPortalNotifications(options: { now?: Date; limit?: number; taskId?: string; tenantId?: string; transport?: (mail: MailInput) => Promise<{ sent: boolean; reason?: string }> } = {}) {
  const now = options.now || new Date(), transport = options.transport || sendMail;
  await prisma.tenantPortalNotification.updateMany({ where: { status: "SENDING", claimedAt: { lt: new Date(now.getTime() - 15 * 60000) } }, data: { status: "UNKNOWN", detail: "Výsledek odeslání nelze potvrdit; automaticky neopakováno." } });
  const rows = await prisma.tenantPortalNotification.findMany({ where: { ...(options.taskId ? { taskId: options.taskId } : {}), ...(options.tenantId ? { tenantId: options.tenantId } : {}), status: { in: ["PENDING", "RETRY"] }, nextAttemptAt: { lte: now }, attempts: { lt: 3 } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: options.limit || 50 });
  let sent = 0, skipped = 0, failed = 0;
  for (const row of rows) {
    const claim = await prisma.tenantPortalNotification.updateMany({ where: { id: row.id, status: { in: ["PENDING", "RETRY"] }, attempts: row.attempts }, data: { status: "SENDING", claimedAt: now, attempts: { increment: 1 } } });
    if (!claim.count) continue;
    const finish = (status: string, detail: string) => prisma.tenantPortalNotification.update({ where: { id: row.id }, data: { status, detail, ...(status === "SENT" ? { sentAt: new Date() } : {}), ...(status === "RETRY" ? { nextAttemptAt: new Date(now.getTime() + 3600000) } : {}) } });
    let sending = false;
    try {
      const access = await prisma.tenantPortalAccess.findUnique({ where: { userId_tenantId: { userId: row.userId, tenantId: row.tenantId } }, include: { user: true, tenant: true } });
      const lease = await prisma.lease.findUnique({ where: { id: row.leaseId }, select: leaseSelect });
      const bankNotice=row.kind==="BANK_ACCOUNT_CHANGE"&&row.announcementId?await prisma.bankAccountNotice.findUnique({where:{announcementId:row.announcementId},select:{tenantIds:true,leaseId:true}}):null;
      const validContract=bankNotice?Boolean(lease?.unit.property.active&&bankNotice.leaseId===row.leaseId&&bankNotice.tenantIds.includes(row.tenantId)):row.kind!=="BANK_ACCOUNT_CHANGE"&&activeContract(lease,row.tenantId,now);
      if (!access?.user.active || !access.tenant.active || !tenantPortalContactMatches(access.user.email, access.tenant) || !validContract || lease!.unit.propertyId !== row.propertyId) { await finish("SKIPPED", "Příjemce nebo nájem již nemá přístup; případně je nemovitost neaktivní."); skipped++; continue; }
      let title = "", context = "", anchor = "oznameni";
      if (row.announcementId) {
        const item = await prisma.announcement.findFirst({ where: { id: row.announcementId, active: true, startsAt: { lte: now }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }], tenantPortalNotificationRevision: row.sourceRevision, ...portalAnnouncementAudience(lease!.id, row.propertyId) } });
        if (!item) { await finish("SKIPPED", "Oznámení již není platné nebo se změnilo."); skipped++; continue; }
        title = item.title; context = item.body; if(bankNotice)anchor="bankovni-oznameni";
      } else if (row.taskId) {
        const task = await prisma.task.findUnique({ where: { id: row.taskId }, select: taskSelect });
        if (!task || !publicTask(task) || task.leaseId !== row.leaseId || task.tenantId !== row.tenantId || task.propertyId !== row.propertyId || task.unitId !== lease!.unitId) { await finish("SKIPPED", "Požadavek již není příjemci přístupný."); skipped++; continue; }
        if (row.kind === "TASK_PUBLISHED" && task.tenantPortalPublishedAt?.getTime() !== row.sourceRevision?.getTime()) { await finish("SKIPPED", "Zadání bylo nahrazeno novější verzí."); skipped++; continue; }
        if (["DUE_SOON", "OVERDUE"].includes(row.kind) && (["DONE", "CANCELLED"].includes(task.status) || task.dueAt?.getTime() !== row.sourceRevision?.getTime())) { await finish("SKIPPED", "Úkol nebo jeho termín se změnil."); skipped++; continue; }
        title = task.tenantPortalTitle!; context = task.tenantPortalBody!;
        if (row.entryId) {
          const entry = await prisma.taskEntry.findFirst({ where: { id: row.entryId, taskId: task.id, visibility: "TENANT_VISIBLE" } });
          if (!entry) { await finish("SKIPPED", "Zpráva již není příjemci přístupná."); skipped++; continue; }
          context = entry.body;
        } else if (row.kind === "STATUS" || ["DUE_SOON", "OVERDUE"].includes(row.kind)) context = `Stav: ${taskStatuses[task.status]}${task.dueAt ? ` · Termín: ${task.dueAt.toLocaleDateString("cs-CZ", { timeZone: "Europe/Prague" })}` : ""}`;
        anchor = `zpravy-spravci-${lease!.id}--${task.id}`;
      } else { await finish("SKIPPED", "Chybí veřejný zdroj upozornění."); skipped++; continue; }
      const origin = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || (process.env.RENDER_GIT_BRANCH === "main" ? "https://flatcloud-rent.onrender.com" : "");
      const url = new URL(origin);
      const blocked = tenantMailSafety({ email: access.user.email, isTestIdentity: access.user.isTestIdentity, origin, branch: process.env.RENDER_GIT_BRANCH, externalUrl: process.env.RENDER_EXTERNAL_URL });
      if (transport === sendMail && blocked) { await finish("SKIPPED", blocked); skipped++; continue; }
      const link = `${url.origin}/portal/najemnik/${encodeURIComponent(row.tenantId)}#${anchor}`;
      const subject = subjects[row.kind as TenantNotificationKind] || "Novinka v portálu nájemníka";
      const cleanTitle = title.replace(/[\r\n]/g, " ");
      // Email is a short operational alert; the authenticated portal holds the complete conversation.
      const excerpt = context.replace(/\s+/g, " ").slice(0, 240);
      const footer = "Jde o provozní upozornění k vašemu nájmu. Na zprávu odpovězte přímo v portálu; odpovědi na tento e-mail se do konverzace nepřenesou.";
      sending = true;
      const result = await transport({ to: access.user.email, subject: `FlatBerry · ${subject} · ${cleanTitle}`, text: `${subject}\n${cleanTitle}\n${excerpt}\n\nOtevřít portál: ${link}\n${footer}`, html: `<h2>${escapeHtml(subject)}</h2><strong>${escapeHtml(cleanTitle)}</strong><p>${escapeHtml(excerpt)}</p><p><a href="${escapeHtml(link)}">Otevřít v portálu nájemníka</a></p><p style="color:#64748b;font-size:12px">${escapeHtml(footer)}</p>` });
      if (result.sent) { await finish("SENT", "Odesláno."); sent++; }
      else { await finish(row.attempts >= 2 ? "FAILED" : "RETRY", result.reason || "Odeslání se nezdařilo."); failed++; }
    } catch (error) {
      const status = sending ? tenantDeliveryFailure(error, row.attempts + 1) : row.attempts >= 2 ? "FAILED" : "RETRY";
      await finish(status, status === "UNKNOWN" ? "Odeslání nebylo potvrzeno; automaticky neopakováno." : "Odeslání se nezdařilo; bezpečné opakování je omezené na tři pokusy.");
      console.error("tenant-portal-notification delivery failed", row.id, error instanceof Error ? error.name : "Error");
      failed++;
    }
  }
  return { sent, skipped, failed };
}
