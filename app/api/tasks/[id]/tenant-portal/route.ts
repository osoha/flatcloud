import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { serializableTransaction } from "@/lib/serializable";
import { tenantPublicationText, validateTaskPublication, canPublishLeaseMessage } from "@/lib/tenant-portal-messages";
import { goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, target = `/ukoly/${id}#portal-najemnika`;
  try {
    const user = await currentUser();
    if (!user || request.headers.get("sec-fetch-site") === "cross-site") throw new Error("Nemáte oprávnění zveřejnit tento úkol.");
    const form = await request.formData(), action = String(form.get("action") || "");
    const task = await prisma.task.findUnique({ where: { id } });
    if (!task?.leaseId || !await canPublishLeaseMessage(user, task.leaseId)) throw new Error("Nemáte oprávnění zveřejnit tento úkol.");
    if (form.get("revision") !== task.updatedAt.toISOString()) throw new Error("Úkol se změnil. Obnovte stránku.");
    if (!["publish", "unpublish"].includes(action)) throw new Error("Neplatná akce.");
    if (action === "publish") await validateTaskPublication(user, task);
    const data = action === "publish" ? { ...tenantPublicationText(form), tenantPortalPublishedAt: new Date(), tenantPortalPublishedById: user.id } : { tenantPortalPublishedAt: null };
    await serializableTransaction(async tx => {
      const changed = await tx.task.updateMany({ where: { id, updatedAt: task.updatedAt }, data });
      if (changed.count !== 1) throw new Error("Úkol se mezitím změnil. Obnovte stránku.");
      if (action === "publish") await tx.taskUserState.updateMany({ where: { taskId: id }, data: { tenantConfirmedAt: null } });
      await tx.auditLog.create({ data: { userId: user.id, propertyId: task.propertyId, action: action === "publish" ? "TASK_PORTAL_PUBLISHED" : "TASK_PORTAL_UNPUBLISHED", entityType: "Task", entityId: id, details: { tenantId: task.tenantId, leaseId: task.leaseId } } });
    });
    return goWithMessage(request, target, "ok", action === "publish" ? "Zadání bylo zveřejněno v portálu nájemníka." : "Zadání bylo staženo z portálu nájemníka.");
  } catch (error) { return goWithMessage(request, target, "error", error instanceof Error ? error.message : "Zveřejnění se nezdařilo."); }
}
