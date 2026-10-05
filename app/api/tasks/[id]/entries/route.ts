import { after } from "next/server";
import { discussionParticipants } from "@/lib/task-discussion";
import { parseMentions, withGroupMentions, mentionRecipientIds, taskComposerMode } from "@/lib/task-discussion-shared";
import { enqueueEntryNotifications, processTaskNotifications } from "@/lib/task-notifications";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { text } from "@/lib/forms";
import { go, goWithMessage } from "@/lib/route-response";
import { prepareDocumentFiles,documentCategory } from "@/lib/documents/upload";
import { cleanupStoredDocumentBatch, createStoredDocumentsInTransaction, prepareDocumentBatch, storePreparedDocumentBatch } from "@/lib/documents/batch-service";
import { authoritativeTaskUnitId, canEditTask, parseTaskEntryVisibility } from "@/lib/task-access";
import { randomUUID } from "node:crypto";
import { serializableTransaction } from "@/lib/serializable";
import { cleanupTaskAttachments, createTaskAttachmentsInTransaction, storeTaskAttachments } from "@/lib/task-attachments";
import { NextResponse } from "next/server";
import { validateStaffTenantReply } from "@/lib/tenant-portal-conversations";
import { enqueueTenantTaskNotification, processTenantPortalNotifications } from "@/lib/tenant-portal-notifications";

const kinds = new Set(["COMMENT", "CALL", "EMAIL", "PROMISE"]);
const jsonRequest = (request: Request) => request.headers.get("accept")?.includes("application/json");
const result = (request: Request, path: string, type: "ok" | "error", message: string, status = 400) =>
  jsonRequest(request)
    ? NextResponse.json(type === "ok" ? { ok: true, url: `${path}?ok=${encodeURIComponent(message)}` } : { error: message }, { status: type === "ok" ? 200 : status })
    : goWithMessage(request, path, type, message);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return jsonRequest(request) ? NextResponse.json({ error: "Přihlášení vypršelo. Přihlaste se v nové kartě a pak zkuste odeslat znovu." }, { status: 401 }) : go(request, "/login");
  const { id } = await params;
  const task = await prisma.task.findUnique({ where: { id }, select: { id: true, createdById: true, assigneeId: true, propertyId: true, unitId:true, leaseId: true, tenantId: true, lease:{select:{unitId:true}} } });
  if (!task) return result(request, "/ukoly", "error", "Úkol nebyl nalezen.", 404);
  const canEdit=await canEditTask(user,task);
  if (!canEdit) return result(request, `/ukoly/${id}`, "error", "Nemáte oprávnění přidávat záznamy.", 403);
  try {
    const form = await request.formData();
    const visibility = parseTaskEntryVisibility(form, true);
    const hasFiles=form.getAll("files").some(value=>value instanceof File&&value.size>0);
    if (visibility === "TENANT_VISIBLE" && hasFiles) throw new Error("Odpověď nájemníkovi nyní podporuje text. Interní přílohy přidejte do samostatného interního záznamu.");
    const preparedFiles=hasFiles?await prepareDocumentFiles(form):[];
    // HTML form submission may encode textarea line breaks as CRLF. Mention offsets
    // originate in the editor's LF-normalized textarea value.
    const body = String(form.get("body") || "").replace(/\r\n?/g, "\n");
    if (!body.trim() || body.length > 50000) throw new Error("Vyplňte text záznamu (nejvýše 50 000 znaků).");
    const mentions = withGroupMentions(body, parseMentions(JSON.parse(String(form.get("mentions") || "[]")), body));
    const recipientIds = [...new Set(form.getAll("notificationRecipientIds").map(String))];
    if (recipientIds.length > 100) throw new Error("Příliš mnoho příjemců.");
    const kindRaw = text(form, "kind") || "COMMENT";
    if (!kinds.has(kindRaw)) throw new Error("Neplatný typ záznamu.");
    if (visibility === "TENANT_VISIBLE" && (kindRaw !== "COMMENT" || mentions.length || recipientIds.length)) throw new Error("Odpověď nájemníkovi odešlete jako zprávu bez interních zmínek a příjemců.");
    if (visibility === "TENANT_VISIBLE" && body.length > 5000) throw new Error("Odpověď nájemníkovi může mít nejvýše 5 000 znaků.");

    const promiseDateRaw = kindRaw === "PROMISE" ? text(form, "promiseDate") : null;
    const promiseAmountRaw = kindRaw === "PROMISE" ? text(form, "promiseAmount") : null;
    const promiseDate = promiseDateRaw ? new Date(`${promiseDateRaw}T12:00:00`) : null;
    const promiseAmountCents = promiseAmountRaw ? Math.round(Number(promiseAmountRaw.replace(",", ".")) * 100) : null;
    if (promiseDate && Number.isNaN(promiseDate.getTime())) throw new Error("Neplatné datum příslibu.");
    if (promiseAmountRaw && (!promiseAmountCents || promiseAmountCents <= 0)) throw new Error("Přislíbená částka musí být vyšší než 0 Kč.");

    const entryId=randomUUID(),unitId=authoritativeTaskUnitId(task);
    const documentInputs=task.propertyId?preparedFiles.map(file=>({propertyId:task.propertyId!,unitId:unitId||undefined,leaseId:task.leaseId||undefined,taskId:id,taskEntryId:entryId,...file,category:documentCategory(null,file),title:file.originalName})):[];
    const documentScope=unitId?{mode:"UNIT" as const,propertyId:task.propertyId!,unitId}:{mode:"PROPERTY" as const,propertyId:task.propertyId!};
    const preparedBatch=await prepareDocumentBatch(user,documentInputs,documentInputs.map(()=>documentScope));
    const storedBatch=await storePreparedDocumentBatch(preparedBatch);
    const taskAttachmentBatch=!task.propertyId&&preparedFiles.length?await storeTaskAttachments(user,preparedFiles):null;
    try{await serializableTransaction(async tx=>{
    const people = (await discussionParticipants(id, tx, mentions.some(m => m.userId === "group:flatcloud"))).filter(person => visibility === "OWNER_VISIBLE" || person.internal);
    if (mentions.some(m => !m.userId.startsWith("group:") && !people.some(person => person.participant !== false && person.id === m.userId && person.name === m.label))) throw new Error("Jméno označené osoby se změnilo. Vyberte ji znovu.");
    if (recipientIds.some(personId => !people.some(person => person.participant !== false && person.id === personId))) throw new Error("Některý označený příjemce nemá přístup k tomuto záznamu. Obnovte stránku a vyberte ho znovu.");
    const freshTask = await tx.task.findUnique({ where: { id }, include: { lease: { select: { unitId: true } }, conditionPlanExecution: { select: { id: true } } } });
    if (!freshTask || !await canEditTask(user, freshTask, tx)) throw new Error("Oprávnění k zápisu se změnilo.");
    if (visibility === "TENANT_VISIBLE") {
      if (freshTask.tenantId !== task.tenantId || freshTask.leaseId !== task.leaseId || freshTask.unitId !== task.unitId || freshTask.propertyId !== task.propertyId) throw new Error("Adresát konverzace se mezitím změnil. Obnovte detail a odpověď zkontrolujte.");
      await validateStaffTenantReply(tx, user, freshTask);
    }
    const mode = taskComposerMode(freshTask);
    if (kindRaw === "PROMISE" && !mode.allowPromise) throw new Error("Příslib nelze přidat: vyžaduje otevřené vymáhání navázané na jednotku, nájemníka nebo smlouvu.");
    if (kindRaw !== "COMMENT" && !mode.showKinds) throw new Error("Tento typ záznamu není pro daný úkol dostupný.");
    if (kindRaw === "PROMISE" && !promiseDate) throw new Error("Vyplňte datum příslibu úhrady.");
    if (kindRaw === "PROMISE") {
      const claim = await tx.task.updateMany({ where: { id, status: { notIn: ["DONE", "CANCELLED"] }, conditionPlanExecution: { is: null } }, data: { status: "WAITING", closedAt: null, ...(promiseDate && visibility === "OWNER_VISIBLE" ? { dueAt: promiseDate } : {}) } });
      if (claim.count !== 1) throw new Error("Příslib nelze přidat k uzavřenému případu ani řízené CAPEX realizaci. Nejprve znovu otevřete případ příslušným postupem.");
    }
    const entry = await tx.taskEntry.create({
      data: {
        id:entryId,
        taskId: id,
        authorId: user.id,
        kind: kindRaw as "COMMENT" | "CALL" | "EMAIL" | "PROMISE" | "STATUS" | "SYSTEM",
        body, visibility, mentions,
        promisedPaymentDate: kindRaw === "PROMISE" ? promiseDate : null,
        promisedAmountCents: kindRaw === "PROMISE" ? promiseAmountCents : null,
      },
    });
    await enqueueEntryNotifications(tx, { taskId: id, entryId, authorId: user.id, visibility, mentionedIds: mentionRecipientIds(mentions, people), recipientIds });
    if (visibility === "TENANT_VISIBLE") await enqueueTenantTaskNotification(tx, { taskId: id, kind: "REPLY", eventKey: `reply:${entry.id}`, entryId: entry.id, excludeUserId: user.id });
    await tx.task.update({ where: { id }, data: { updatedAt: new Date() } });
    if (kindRaw === "PROMISE") {
      if (task.leaseId && visibility === "OWNER_VISIBLE") await tx.lease.update({ where: { id: task.leaseId }, data: { promisedPaymentDate: promiseDate, promisedAmountCents: promiseAmountCents && promiseAmountCents > 0 ? promiseAmountCents : null, collectionNote: body } });
    }
    await createStoredDocumentsInTransaction(tx,storedBatch);
    if(taskAttachmentBatch)await createTaskAttachmentsInTransaction(tx,taskAttachmentBatch,id,entry.id);
    await tx.auditLog.create({data:{userId:user.id,propertyId:task.propertyId,action:"TASK_ENTRY_ADDED",entityType:"TaskEntry",entityId:entry.id,details:{taskId:id,kind:kindRaw,visibility,promiseDate:promiseDate?.toISOString(),promiseAmountCents,attachmentCount:preparedFiles.length}}});
    });}catch(error){await cleanupStoredDocumentBatch(storedBatch);if(taskAttachmentBatch)await cleanupTaskAttachments(taskAttachmentBatch);throw error;}
    after(async () => { try { await processTaskNotifications({ taskId: id }); if (visibility === "TENANT_VISIBLE") await processTenantPortalNotifications({ taskId: id }); } catch { console.error("Task notification worker failed; queue retained."); } });
    return result(request, `/ukoly/${id}`, "ok", "Záznam byl přidán do vlákna.");
  } catch (error) {
    return result(request, `/ukoly/${id}`, "error", error instanceof Error ? error.message : "Záznam se nepodařilo přidat.");
  }
}
