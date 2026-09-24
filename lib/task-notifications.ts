import { randomUUID } from "node:crypto";
import { prisma } from "./db";
import { discussionParticipants, visibleTaskEntry, type DiscussionClient } from "./task-discussion";
import { notificationDefaults } from "./task-discussion-shared";
import { taskViewWhere } from "./task-access";
import { sendMail, escapeHtml, type MailInput } from "./email";
import { taskStatuses } from "./labels";
import { businessDateKey } from "./calendar";

type Kind = "MENTION" | "COMMENT" | "ASSIGNMENT" | "STATUS" | "DUE_SOON" | "OVERDUE";
export function notificationAllowed(kind: string, preference: typeof notificationDefaults | null) {
  const p = preference || notificationDefaults;
  return p.emailEnabled && (kind === "MENTION" ? p.mentions : kind === "COMMENT" ? p.comments : kind === "ASSIGNMENT" ? p.assignments : kind === "STATUS" ? p.statusChanges : p.deadlines);
}
async function enqueue(client: DiscussionClient, taskId: string, userId: string, kind: Kind, eventKey: string, entryId?: string) {
  const preference = await client.taskNotificationPreference.findUnique({ where: { userId } });
  if (!notificationAllowed(kind, preference)) return;
  await client.taskNotification.createMany({ data: [{ id: randomUUID(), taskId, userId, kind, entryId, dedupeKey: `${eventKey}:${userId}` }], skipDuplicates: true });
}

export async function enqueueEntryNotifications(client: DiscussionClient, input: { taskId: string; entryId: string; authorId: string; visibility: string; mentionedIds: string[]; recipientIds: string[] }) {
  const people = (await discussionParticipants(input.taskId, client)).filter(p => p.id !== input.authorId && (input.visibility === "OWNER_VISIBLE" || p.internal));
  const explicit = new Set([...input.mentionedIds, ...input.recipientIds]);
  for (const person of people) await enqueue(client, input.taskId, person.id, explicit.has(person.id) ? "MENTION" : "COMMENT", `entry:${input.entryId}`, input.entryId);
}

/** Observe assignment/status changes, including tasks created by automatic events. */
export async function collectTaskNotifications(now = new Date()) {
  const changed = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT t."id" FROM "Task" t LEFT JOIN "TaskNotificationSnapshot" s ON s."taskId"=t."id"
    WHERE s."taskId" IS NULL OR t."updatedAt">s."observedAt"
    ORDER BY t."updatedAt",t."id" LIMIT 250`;
  for (const { id } of changed) await prisma.$transaction(async tx => {
    const task = await tx.task.findUnique({ where: { id }, include: { notificationSnapshot: true, entries: { orderBy: { createdAt: "desc" }, take: 1, select: { authorId: true } } } });
    if (!task) return;
    const previous = task.notificationSnapshot;
    const people = await discussionParticipants(id, tx);
    const authorId = task.entries[0]?.authorId;
    if (task.assigneeId && task.assigneeId !== authorId && task.assigneeId !== previous?.assigneeId && people.some(p => p.id === task.assigneeId)) await enqueue(tx, id, task.assigneeId, "ASSIGNMENT", `assigned:${id}:${task.updatedAt.toISOString()}`);
    if (previous && task.status !== previous.status) for (const person of people) if (person.id !== authorId) await enqueue(tx, id, person.id, "STATUS", `status:${id}:${task.updatedAt.toISOString()}`);
    const data = { assigneeId: task.assigneeId, status: task.status, observedAt: task.updatedAt };
    await tx.taskNotificationSnapshot.upsert({ where: { taskId: id }, create: { taskId: id, ...data }, update: data });
  });
  const tasks = await prisma.task.findMany({ where: { status: { notIn: ["DONE", "CANCELLED"] }, assigneeId: { not: null }, dueAt: { gte: new Date(now.getTime() - 86400000), lte: new Date(now.getTime() + 86400000) } }, include: { notificationSnapshot: true, assignee: true } });
  for (const task of tasks) {
    if (!task.assignee?.active || !task.dueAt || !task.notificationSnapshot) continue;
    if (!await prisma.task.count({ where: { AND: [{ id: task.id }, taskViewWhere(task.assignee)] } })) continue;
    const overdue = businessDateKey(task.dueAt) < businessDateKey(now);
    if (overdue && task.dueAt < task.notificationSnapshot.trackingSince) continue;
    const kind = overdue ? "OVERDUE" : "DUE_SOON";
    await enqueue(prisma, task.id, task.assignee.id, kind, `deadline:${task.id}:${task.dueAt.toISOString()}:${kind}`);
  }
  return { observed: changed.length };
}

const subjects: Record<string,string> = { MENTION: "Zmínka nebo adresné upozornění", COMMENT: "Nový komentář", ASSIGNMENT: "Přiřazený úkol", STATUS: "Změna stavu úkolu", DUE_SOON: "Blíží se termín úkolu", OVERDUE: "Úkol po termínu" };
export async function processTaskNotifications(options: { taskId?: string; now?: Date; limit?: number; transport?: (mail: MailInput) => Promise<{ sent: boolean; reason?: string }> } = {}) {
  const now = options.now || new Date(), transport = options.transport || sendMail;
  // A worker lost after SMTP might have delivered. Never blindly re-send such a claim.
  await prisma.taskNotification.updateMany({ where: { status: "SENDING", claimedAt: { lt: new Date(now.getTime() - 15 * 60000) } }, data: { status: "UNKNOWN", detail: "Výsledek odeslání nelze potvrdit; automaticky neopakováno." } });
  const rows = await prisma.taskNotification.findMany({ where: { ...(options.taskId ? { taskId: options.taskId } : {}), status: { in: ["PENDING", "RETRY"] }, nextAttemptAt: { lte: now }, attempts: { lt: 3 } }, orderBy: { createdAt: "asc" }, take: options.limit || 50 });
  let sent = 0, skipped = 0, failed = 0;
  for (const row of rows) {
    const claimed = await prisma.taskNotification.updateMany({ where: { id: row.id, status: { in: ["PENDING", "RETRY"] }, attempts: row.attempts }, data: { status: "SENDING", claimedAt: now, attempts: { increment: 1 } } });
    if (!claimed.count) continue;
    const finish = (status: string, detail: string) => prisma.taskNotification.update({ where: { id: row.id }, data: { status, detail, ...(status === "SENT" ? { sentAt: new Date() } : {}) } });
    try {
      const user = await prisma.user.findUnique({ where: { id: row.userId }, include: { notificationPreferences: true } });
      const people = await discussionParticipants(row.taskId);
      if (!user?.active || !people.some(p => p.id === user.id) || !notificationAllowed(row.kind, user.notificationPreferences)) { await finish("SKIPPED", "Upozornění vypnuto nebo příjemce již nemá přístup."); skipped++; continue; }
      const entry = row.entryId ? await visibleTaskEntry(user, row.taskId, row.entryId) : null;
      const task = await prisma.task.findFirst({ where: { AND: [{ id: row.taskId }, taskViewWhere(user)] } });
      if (!task || (row.entryId && !entry)) { await finish("SKIPPED", "Záznam již není přístupný."); skipped++; continue; }
      if ((row.kind === "ASSIGNMENT" || row.kind === "DUE_SOON" || row.kind === "OVERDUE") && task.assigneeId !== user.id || (["DUE_SOON", "OVERDUE"].includes(row.kind) && (["DONE", "CANCELLED"].includes(task.status) || !task.dueAt || !row.dedupeKey.includes(task.dueAt.toISOString())))) { await finish("SKIPPED", "Úkol nebo jeho termín se změnil."); skipped++; continue; }
      // Cron services have no RENDER_EXTERNAL_URL; APP_URL overrides this current main deployment.
      const origin = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || (process.env.RENDER_GIT_BRANCH === "main" ? "https://flatcloud-rent.onrender.com" : "");
      const url = new URL(origin);
      if (transport === sendMail && (process.env.RENDER_GIT_BRANCH?.startsWith("sandbox/") || url.hostname.includes("sandbox") || process.env.RENDER_EXTERNAL_URL?.includes("sandbox") || user.isTestIdentity || /\.(test|invalid)$/.test(user.email))) { await finish("SKIPPED", "Testovací prostředí nebo testovací příjemce: e-mail neodeslán."); skipped++; continue; }
      if (transport === sendMail && url.protocol !== "https:") throw new Error("Pro e-mail chybí HTTPS adresa aplikace.");
      const link = `${url.origin}/ukoly/${encodeURIComponent(task.id)}${entry ? `#zaznam-${entry.id}` : ""}`;
      const author = entry?.authorId ? await prisma.user.findUnique({ where: { id: entry.authorId }, select: { name: true } }) : null;
      const context = entry ? entry.body.replace(/\s+/g, " ").slice(0, 240) : `Stav: ${taskStatuses[task.status]}${task.dueAt ? ` · Termín: ${task.dueAt.toLocaleDateString("cs-CZ")}` : ""}`;
      const title = task.title.replace(/[\r\n]/g, " ");
      const message = `${author?.name ? `${author.name}: ` : ""}${context}`;
      const result = await transport({ to: user.email, subject: `FlatBerry · ${subjects[row.kind]} · ${title}`, text: `${subjects[row.kind]}\n${title}\n${message}\n${link}\nNastavení upozornění: ${url.origin}/ucet#upozorneni`, html: `<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>${escapeHtml(subjects[row.kind])}</h2><strong>${escapeHtml(title)}</strong><p>${escapeHtml(message)}</p><p><a href="${escapeHtml(link)}">Otevřít ve FlatBerry</a></p><small><a href="${url.origin}/ucet#upozorneni">Nastavit nebo vypnout upozornění</a></small></div>` });
      if (result.sent) { await finish("SENT", "Odesláno."); sent++; }
      else { await prisma.taskNotification.update({ where: { id: row.id }, data: { status: row.attempts >= 2 ? "FAILED" : "RETRY", detail: result.reason || "Odeslání se nezdařilo.", nextAttemptAt: new Date(now.getTime() + 3600000) } }); failed++; }
    } catch (error) {
      const smtp = error as { code?: string; responseCode?: number; command?: string };
      const rejected = typeof smtp.responseCode === "number" && smtp.responseCode >= 400;
      const beforeDelivery = smtp.code === "ECONNECTION" || smtp.code === "EDNS" || smtp.code === "EAUTH" || smtp.command === "CONN";
      if (rejected || beforeDelivery) {
        const permanent = smtp.code === "EAUTH" || (smtp.responseCode || 0) >= 500 || row.attempts >= 2;
        await prisma.taskNotification.update({ where: { id: row.id }, data: { status: permanent ? "FAILED" : "RETRY", detail: "Poštovní služba odeslání odmítla nebo není dostupná.", nextAttemptAt: new Date(now.getTime() + 3600000) } });
      } else {
        // An SMTP/network exception can mean an ambiguous delivery; retain for review.
        await finish("UNKNOWN", "Odeslání nebylo potvrzeno. Zpráva se automaticky neopakuje.");
      }
      console.error("task-notification delivery failed", row.id, error instanceof Error ? error.name : "Error");
      failed++;
    }
  }
  return { sent, skipped, failed };
}
