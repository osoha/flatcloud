import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { text } from "@/lib/forms";
import { go, goWithMessage } from "@/lib/route-response";
import { prepareDocumentFiles,documentCategory } from "@/lib/documents/upload";
import { cleanupStoredDocumentBatch, createStoredDocumentsInTransaction, prepareDocumentBatch, storePreparedDocumentBatch } from "@/lib/documents/batch-service";
import { authoritativeTaskUnitId, canEditTask } from "@/lib/task-access";
import { randomUUID } from "node:crypto";

const kinds = new Set(["COMMENT", "CALL", "EMAIL", "PROMISE", "STATUS", "SYSTEM"]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return go(request, "/login");
  const { id } = await params;
  const task = await prisma.task.findUnique({ where: { id }, select: { id: true, propertyId: true, unitId:true, leaseId: true, lease:{select:{unitId:true}} } });
  if (!task) return goWithMessage(request, "/ukoly", "error", "Úkol nebyl nalezen.");
  const canEdit=await canEditTask(user,task);
  if (!canEdit) return goWithMessage(request, `/ukoly/${id}`, "error", "Nemáte oprávnění přidávat záznamy.");
  try {
    const form = await request.formData();
    const hasFiles=form.getAll("files").some(value=>value instanceof File&&value.size>0);
    const preparedFiles=hasFiles?await prepareDocumentFiles(form):[];
    const body = text(form, "body", true)!;
    const kindRaw = text(form, "kind") || "COMMENT";
    if (!kinds.has(kindRaw)) throw new Error("Neplatný typ záznamu.");

    const promiseDateRaw = kindRaw === "PROMISE" ? text(form, "promiseDate") : null;
    const promiseAmountRaw = kindRaw === "PROMISE" ? text(form, "promiseAmount") : null;
    const promiseDate = promiseDateRaw ? new Date(`${promiseDateRaw}T12:00:00`) : null;
    const promiseAmountCents = promiseAmountRaw ? Math.round(Number(promiseAmountRaw.replace(",", ".")) * 100) : null;
    if (promiseDate && Number.isNaN(promiseDate.getTime())) throw new Error("Neplatné datum příslibu.");
    if (promiseAmountRaw && (!promiseAmountCents || promiseAmountCents <= 0)) throw new Error("Přislíbená částka musí být vyšší než 0 Kč.");

    const entryId=randomUUID(),unitId=authoritativeTaskUnitId(task);
    const documentInputs=preparedFiles.map(file=>({propertyId:task.propertyId,unitId:unitId||undefined,leaseId:task.leaseId||undefined,taskId:id,taskEntryId:entryId,...file,category:documentCategory(null,file),title:file.originalName}));
    const documentScope=unitId?{mode:"UNIT" as const,propertyId:task.propertyId,unitId}:{mode:"PROPERTY" as const,propertyId:task.propertyId};
    const preparedBatch=await prepareDocumentBatch(user,documentInputs,documentInputs.map(()=>documentScope));
    const storedBatch=await storePreparedDocumentBatch(preparedBatch);
    try{await prisma.$transaction(async tx=>{const entry = await tx.taskEntry.create({
      data: {
        id:entryId,
        taskId: id,
        authorId: user.id,
        kind: kindRaw as "COMMENT" | "CALL" | "EMAIL" | "PROMISE" | "STATUS" | "SYSTEM",
        body,
        promisedPaymentDate: kindRaw === "PROMISE" ? promiseDate : null,
        promisedAmountCents: kindRaw === "PROMISE" ? promiseAmountCents : null,
      },
    });
    if (kindRaw === "PROMISE") {
      await tx.task.update({ where: { id }, data: { status: "WAITING", ...(promiseDate ? { dueAt: promiseDate } : {}) } });
      if (task.leaseId) await tx.lease.update({ where: { id: task.leaseId }, data: { promisedPaymentDate: promiseDate, promisedAmountCents: promiseAmountCents && promiseAmountCents > 0 ? promiseAmountCents : null, collectionNote: body } });
    }
    await createStoredDocumentsInTransaction(tx,storedBatch);
    await tx.auditLog.create({data:{userId:user.id,propertyId:task.propertyId,action:"TASK_ENTRY_ADDED",entityType:"TaskEntry",entityId:entry.id,details:{taskId:id,kind:kindRaw,promiseDate:promiseDate?.toISOString(),promiseAmountCents}}});
    });}catch(error){await cleanupStoredDocumentBatch(storedBatch);throw error;}
    return goWithMessage(request, `/ukoly/${id}`, "ok", "Záznam byl přidán do vlákna.");
  } catch (error) {
    return goWithMessage(request, `/ukoly/${id}`, "error", error instanceof Error ? error.message : "Záznam se nepodařilo přidat.");
  }
}
