import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dateValue, text } from "@/lib/forms";
import { hasPropertyPermission } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";
import { prepareDocumentFiles,documentCategory } from "@/lib/documents/upload";
import { DocumentPhotoStage } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { cleanupStoredDocumentBatch, createStoredDocumentsInTransaction, prepareDocumentBatch, storePreparedDocumentBatch } from "@/lib/documents/batch-service";
import { cleanupTaskAttachments, createTaskAttachmentsInTransaction, storeTaskAttachments } from "@/lib/task-attachments";

const categories = new Set(["COLLECTION", "MAINTENANCE", "LEASE", "COMPLIANCE", "GENERAL"]);
const priorities = new Set(["LOW", "NORMAL", "HIGH", "URGENT"]);

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return go(request, "/login");
  let propertyId = "";
  try {
    const form = await request.formData();
    const hasFiles=form.getAll("files").some(value=>value instanceof File&&value.size>0);
    const preparedFiles=hasFiles?await prepareDocumentFiles(form):[];
    propertyId = text(form, "propertyId") || "";
    if (propertyId) {
      if (!(await hasPropertyPermission(user, propertyId, "EDIT"))) throw new Error("Nemáte oprávnění vytvářet úkoly pro tuto nemovitost.");
    } else if (!(["SUPER_ADMIN", "MANAGER"] as string[]).includes(user.role)) {
      throw new Error("Obecné týmové úkoly může založit administrátor nebo manažer.");
    }
    const title = text(form, "title", true)!;
    const description = text(form, "description");
    const categoryRaw = text(form, "category") || "GENERAL";
    const priorityRaw = text(form, "priority") || "NORMAL";
    const assigneeId = text(form, "assigneeId");
    const dueAt = dateValue(form, "dueAt");
    const unitId = text(form, "unitId");
    const leaseId = text(form, "leaseId");
    const tenantId = text(form, "tenantId");
    const collaboratorIds = form.getAll("collaboratorIds").filter((value): value is string => typeof value === "string" && Boolean(value));
    const watcherIds = form.getAll("watcherIds").filter((value): value is string => typeof value === "string" && Boolean(value) && !collaboratorIds.includes(value));
    let resolvedUnitId = unitId;
    let resolvedTenantId = tenantId;
    if (categoryRaw === "COLLECTION" && !leaseId) throw new Error("Upomínkový případ musí být navázaný na konkrétní smlouvu.");
    if (!categories.has(categoryRaw)) throw new Error("Neplatná kategorie úkolu.");
    if (!priorities.has(priorityRaw)) throw new Error("Neplatná priorita úkolu.");

    if (!propertyId && (unitId || leaseId || tenantId)) throw new Error("Obecný úkol nelze navázat na jednotku, smlouvu ani nájemníka.");
    if (unitId) {
      const unit = await prisma.unit.findFirst({ where: { id: unitId, propertyId }, select: { id: true } });
      if (!unit) throw new Error("Vybraná jednotka nepatří k této nemovitosti.");
    }
    if (leaseId) {
      const lease = await prisma.lease.findFirst({
        where: { id: leaseId, unit: { propertyId } },
        select: { id: true, unitId: true, tenantId: true },
      });
      if (!lease) throw new Error("Vybraná smlouva nepatří k této nemovitosti.");
      if (unitId && lease.unitId !== unitId) throw new Error("Vybraná smlouva nepatří k vybrané jednotce.");
      if (tenantId && lease.tenantId !== tenantId) throw new Error("Vybraná smlouva nepatří k vybranému nájemníkovi.");
      resolvedUnitId = lease.unitId;
      resolvedTenantId = lease.tenantId;
    }
    if (tenantId && !leaseId) {
      const tenantInProperty = await prisma.lease.findFirst({ where: { tenantId, unit: { propertyId } }, select: { id: true } });
      if (!tenantInProperty) throw new Error("Vybraný nájemník nemá v této nemovitosti evidovanou smlouvu.");
    }
    if (assigneeId) {
      const assignee = await prisma.user.findFirst({
        where: {
          id: assigneeId,
          active: true,
          OR: propertyId ? [
            { role: { in: ["SUPER_ADMIN", "MANAGER"] } },
            { allProperties: true },
            { memberships: { some: { propertyId } } },
            { unitMemberships: { some: { unit: { propertyId } } } },
          ] : undefined,
        },
        select: { id: true },
      });
      if (!assignee) throw new Error("Vybraný řešitel nemá přístup k této nemovitosti.");
    }

    const memberIds = [...new Set([...collaboratorIds, ...watcherIds])].filter((id) => id !== user.id && id !== assigneeId);
    if (memberIds.length) {
      const activeMembers = await prisma.user.count({ where: { id: { in: memberIds }, active: true } });
      if (activeMembers !== memberIds.length) throw new Error("Některý vybraný účastník není aktivní.");
    }

    const taskId=randomUUID();
    const documentInputs=propertyId?preparedFiles.map(file=>({propertyId,unitId:resolvedUnitId||undefined,leaseId:leaseId||undefined,taskId,...file,category:documentCategory(null,file),photoStage:categoryRaw==="MAINTENANCE"&&file.mimeType.startsWith("image/")?DocumentPhotoStage.BEFORE:undefined,title:file.originalName})):[];
    const documentScope=resolvedUnitId?{mode:"UNIT" as const,propertyId,unitId:resolvedUnitId}:{mode:"PROPERTY" as const,propertyId};
    const preparedBatch=await prepareDocumentBatch(user,documentInputs,documentInputs.map(()=>documentScope));
    const storedBatch=await storePreparedDocumentBatch(preparedBatch);
    const taskAttachmentBatch=!propertyId&&preparedFiles.length?await storeTaskAttachments(user,preparedFiles):null;
    let created;
    try{created=await prisma.$transaction(async tx=>{const task=await tx.task.create({
      data: { id:taskId,
        title,
        description,
        category: categoryRaw as "COLLECTION" | "MAINTENANCE" | "LEASE" | "COMPLIANCE" | "GENERAL",
        priority: priorityRaw as "LOW" | "NORMAL" | "HIGH" | "URGENT",
        propertyId: propertyId || undefined,
        createdById: user.id,
        assigneeId: assigneeId || undefined,
        dueAt: dueAt || undefined,
        unitId: resolvedUnitId || undefined,
        leaseId: leaseId || undefined,
        tenantId: resolvedTenantId || undefined,
        members: { create: [
          ...collaboratorIds.filter((id) => memberIds.includes(id)).map((userId) => ({ userId, role: "COLLABORATOR" as const })),
          ...watcherIds.filter((id) => memberIds.includes(id)).map((userId) => ({ userId, role: "WATCHER" as const })),
        ] },
        entries: { create: { authorId: user.id, kind: "SYSTEM", body: "Úkol byl založen." } },
      },
    });
    await createStoredDocumentsInTransaction(tx,storedBatch);
    if(taskAttachmentBatch)await createTaskAttachmentsInTransaction(tx,taskAttachmentBatch,task.id);
    await tx.auditLog.create({data:{userId:user.id,propertyId:propertyId||null,action:"TASK_CREATED",entityType:"Task",entityId:task.id,details:{title,category:categoryRaw,priority:priorityRaw,memberIds,attachmentCount:preparedFiles.length}}});
    return task;});}catch(error){await cleanupStoredDocumentBatch(storedBatch);if(taskAttachmentBatch)await cleanupTaskAttachments(taskAttachmentBatch);throw error;}
    return goWithMessage(request, `/ukoly/${created.id}`, "ok", "Úkol byl vytvořen.");
  } catch (error) {
    return goWithMessage(request, propertyId ? `/ukoly/novy?propertyId=${propertyId}` : "/ukoly/novy", "error", error instanceof Error ? error.message : "Úkol se nepodařilo vytvořit.");
  }
}
