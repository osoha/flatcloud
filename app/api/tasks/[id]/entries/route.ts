import { after } from "next/server";
import { discussionParticipants } from "@/lib/task-discussion";
import { parseMentions } from "@/lib/task-discussion-shared";
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

const kinds = new Set(["COMMENT", "CALL", "EMAIL", "PROMISE", "STATUS", "SYSTEM"]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return go(request, "/login");
  const { id } = await params;
  const task = await prisma.task.findUnique({ where: { id }, select: { id: true, createdById: true, assigneeId: true, propertyId: true, unitId:true, leaseId: true, lease:{select:{unitId:true}} } });
  if (!task) return goWithMessage(request, "/ukoly", "error", "Úkol nebyl nalezen.");
  const canEdit=await canEditTask(user,task);
  if (!canEdit) return goWithMessage(request, `/ukoly/${id}`, "error", "Nemáte oprávnění přidávat záznamy.");
  try {
    const form = await request.formData();
    const visibility = parseTaskEntryVisibility(form);
    const hasFiles=form.getAll("files").some(value=>value instanceof File&&value.size>0);
    const preparedFiles=hasFiles?await prepareDocumentFiles(form):[];
    const body = String(form.get("body") || "");
    if (!body.trim() || body.length > 50000) throw new Error("Vyplňte text záznamu (nejvýše 50 000 znaků).");
    const mentions = parseMentions(JSON.parse(String(form.get("mentions") || "[]")), body);
    const recipientIds = [...new Set(form.getAll("notificationRecipientIds").map(String))];
    if (recipientIds.length > 100) throw new Error("Příliš mnoho příjemců.");
    const kindRaw = text(form, "kind") || "COMMENT";
    if (!kinds.has(kindRaw)) throw new Error("Neplatný typ záznamu.");

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
    const people = (await discussionParticipants(id, tx)).filter(person => visibility === "OWNER_VISIBLE" || person.internal);
    if (mentions.some(m => !people.some(person => person.id === m.userId && person.name === m.label))) throw new Error("Jméno označené osoby se změnilo. Vyberte ji znovu.");
    if ([...mentions.map(m => m.userId), ...recipientIds].some(personId => !people.some(person => person.id === personId))) throw new Error("Některý označený příjemce nemá přístup k tomuto záznamu. Obnovte stránku a vyberte ho znovu.");
    if (!await canEditTask(user, task, tx)) throw new Error("Oprávnění k zápisu se změnilo.");
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
    await enqueueEntryNotifications(tx, { taskId: id, entryId, authorId: user.id, visibility, mentionedIds: mentions.map(m => m.userId), recipientIds });
    await tx.task.update({ where: { id }, data: { updatedAt: new Date() } });
    if (kindRaw === "PROMISE") {
      if (task.leaseId && visibility === "OWNER_VISIBLE") await tx.lease.update({ where: { id: task.leaseId }, data: { promisedPaymentDate: promiseDate, promisedAmountCents: promiseAmountCents && promiseAmountCents > 0 ? promiseAmountCents : null, collectionNote: body } });
    }
    await createStoredDocumentsInTransaction(tx,storedBatch);
    if(taskAttachmentBatch)await createTaskAttachmentsInTransaction(tx,taskAttachmentBatch,id,entry.id);
    await tx.auditLog.create({data:{userId:user.id,propertyId:task.propertyId,action:"TASK_ENTRY_ADDED",entityType:"TaskEntry",entityId:entry.id,details:{taskId:id,kind:kindRaw,visibility,promiseDate:promiseDate?.toISOString(),promiseAmountCents,attachmentCount:preparedFiles.length}}});
    });}catch(error){await cleanupStoredDocumentBatch(storedBatch);if(taskAttachmentBatch)await cleanupTaskAttachments(taskAttachmentBatch);throw error;}
    after(async () => { try { await processTaskNotifications({ taskId: id }); } catch { console.error("Task notification worker failed; queue retained."); } });
    return goWithMessage(request, `/ukoly/${id}`, "ok", "Záznam byl přidán do vlákna.");
  } catch (error) {
    return goWithMessage(request, `/ukoly/${id}`, "error", error instanceof Error ? error.message : "Záznam se nepodařilo přidat.");
  }
}
