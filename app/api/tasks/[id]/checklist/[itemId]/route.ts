import { currentUser } from "@/lib/auth";
import { taskAccessWhere } from "@/lib/access";
import { canEditTask } from "@/lib/task-access";
import { prisma } from "@/lib/db";
import { serializableTransaction } from "@/lib/serializable";
import { goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id, itemId } = await params;
  const href = `/ukoly/${id}`;
  const form = await request.formData();
  const action = String(form.get("action") || "");
  if (action !== "complete" && action !== "reopen") return goWithMessage(request,href,"error","Neplatná změna checklistu.");
  try {
    await serializableTransaction(async tx => {
      const task = await tx.task.findFirst({ where: { id, ...taskAccessWhere(user) }, include: { lease: { select: { unitId: true } } } });
      if (!task || !(await canEditTask(user,task,tx))) throw new Error("Nemáte oprávnění měnit tento checklist.");
      if (task.status === "DONE" || task.status === "CANCELLED") throw new Error("Uzavřený úkol nelze měnit.");
      const item = await tx.taskChecklistItem.findFirst({ where: { id: itemId, taskId: id } });
      if (!item) throw new Error("Krok checklistu nebyl nalezen.");
      const completing = action === "complete";
      if (Boolean(item.completedAt) === completing) throw new Error("Krok se mezitím změnil. Obnovte detail úkolu.");
      const claim = await tx.taskChecklistItem.updateMany({
        where: { id: itemId, taskId: id, completedAt: item.completedAt },
        data: { completedAt: completing ? new Date() : null, completedById: completing ? user.id : null },
      });
      if (claim.count !== 1) throw new Error("Krok se mezitím změnil. Obnovte detail úkolu.");
      await tx.auditLog.create({ data: {
        userId: user.id, propertyId: task.propertyId, action: completing ? "TASK_CHECKLIST_COMPLETED" : "TASK_CHECKLIST_REOPENED",
        entityType: "Task", entityId: id, details: { itemId, title: item.title, position: item.position },
      } });
    });
    return goWithMessage(request,href,"ok","Krok checklistu byl uložen.");
  } catch (error) {
    return goWithMessage(request,href,"error",error instanceof Error ? error.message : "Krok se nepodařilo uložit.");
  }
}
