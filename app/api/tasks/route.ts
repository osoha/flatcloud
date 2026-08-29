import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dateValue, text } from "@/lib/forms";
import { hasPropertyPermission } from "@/lib/management";
import { audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";
import { prepareDocumentFiles,documentCategory } from "@/lib/documents/upload";
import { createDocumentFromUpload } from "@/lib/documents/service";
import { DocumentPhotoStage } from "@prisma/client";

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
    propertyId = text(form, "propertyId", true)!;
    if (!(await hasPropertyPermission(user, propertyId, "EDIT"))) throw new Error("Nemáte oprávnění vytvářet úkoly pro tuto nemovitost.");
    const title = text(form, "title", true)!;
    const description = text(form, "description");
    const categoryRaw = text(form, "category") || "GENERAL";
    const priorityRaw = text(form, "priority") || "NORMAL";
    const assigneeId = text(form, "assigneeId");
    const dueAt = dateValue(form, "dueAt");
    const unitId = text(form, "unitId");
    const leaseId = text(form, "leaseId");
    const tenantId = text(form, "tenantId");
    let resolvedUnitId = unitId;
    let resolvedTenantId = tenantId;
    if (categoryRaw === "COLLECTION" && !leaseId) throw new Error("Upomínkový případ musí být navázaný na konkrétní smlouvu.");
    if (!categories.has(categoryRaw)) throw new Error("Neplatná kategorie úkolu.");
    if (!priorities.has(priorityRaw)) throw new Error("Neplatná priorita úkolu.");

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
          OR: [
            { role: { in: ["SUPER_ADMIN", "MANAGER"] } },
            { allProperties: true },
            { memberships: { some: { propertyId } } },
            { unitMemberships: { some: { unit: { propertyId } } } },
          ],
        },
        select: { id: true },
      });
      if (!assignee) throw new Error("Vybraný řešitel nemá přístup k této nemovitosti.");
    }

    const created = await prisma.task.create({
      data: {
        title,
        description,
        category: categoryRaw as "COLLECTION" | "MAINTENANCE" | "LEASE" | "COMPLIANCE" | "GENERAL",
        priority: priorityRaw as "LOW" | "NORMAL" | "HIGH" | "URGENT",
        propertyId,
        createdById: user.id,
        assigneeId: assigneeId || undefined,
        dueAt: dueAt || undefined,
        unitId: resolvedUnitId || undefined,
        leaseId: leaseId || undefined,
        tenantId: resolvedTenantId || undefined,
        entries: { create: { authorId: user.id, kind: "SYSTEM", body: "Úkol byl založen." } },
      },
    });
    await audit(user.id, "TASK_CREATED", "Task", created.id, { title, category: categoryRaw, priority: priorityRaw }, propertyId);
    for(const file of preparedFiles)await createDocumentFromUpload({actor:user,propertyId,unitId:resolvedUnitId||undefined,leaseId:leaseId||undefined,taskId:created.id,...file,category:documentCategory(null,file),photoStage:categoryRaw==="MAINTENANCE"&&file.mimeType.startsWith("image/")?DocumentPhotoStage.BEFORE:undefined,title:file.originalName});
    return goWithMessage(request, `/ukoly/${created.id}`, "ok", "Úkol byl vytvořen.");
  } catch (error) {
    return goWithMessage(request, propertyId ? `/ukoly/novy?propertyId=${propertyId}` : "/ukoly/novy", "error", error instanceof Error ? error.message : "Úkol se nepodařilo vytvořit.");
  }
}
