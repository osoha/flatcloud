import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { text } from "@/lib/forms";
import { go, goWithMessage } from "@/lib/route-response";
import { canEditTask } from "@/lib/task-access";
import { serializableTransaction } from "@/lib/serializable";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return go(request, "/login");
  const { id } = await params;
  try {
    const task = await prisma.task.findUnique({ where: { id }, include: { lease: { select: { unitId: true } }, conditionPlanExecution: { select: { id: true } } } });
    if (!task || !(await canEditTask(user, task))) throw new Error("Nemáte oprávnění znovu otevřít tento případ.");
    if (task.conditionPlanExecution) throw new Error("Stav CAPEX realizace měňte v modulu Kvalita a CAPEX.");
    const form = await request.formData();
    const reason = text(form, "reason", true)!;
    const expectedStatus = text(form, "expectedStatus");
    const expectedUpdatedAt = text(form, "expectedUpdatedAt");
    if (!expectedUpdatedAt || !["DONE", "CANCELLED"].includes(expectedStatus || "")) throw new Error("Obnovte detail uzavřeného případu.");
    if (task.status !== expectedStatus || task.updatedAt.toISOString() !== expectedUpdatedAt) throw new Error("Případ se mezitím změnil. Obnovte jeho detail.");
    await serializableTransaction(async tx => {
      const claim = await tx.task.updateMany({ where: { id, status: task.status, updatedAt: task.updatedAt, conditionPlanExecution: { is: null } }, data: { status: "OPEN", closedAt: null } });
      if (claim.count !== 1) throw new Error("Případ se mezitím změnil. Obnovte jeho detail.");
      const entry = await tx.taskEntry.create({ data: { taskId: id, authorId: user.id, kind: "STATUS", body: `Případ byl znovu otevřen. Důvod: ${reason}` } });
      await tx.auditLog.create({ data: { userId: user.id, propertyId: task.propertyId, action: "TASK_REOPENED", entityType: "Task", entityId: id, details: { fromStatus: task.status, reason, entryId: entry.id } } });
    });
    return goWithMessage(request, `/ukoly/${id}`, "ok", "Případ byl znovu otevřen.");
  } catch (error) {
    return goWithMessage(request, `/ukoly/${id}`, "error", error instanceof Error ? error.message : "Případ se nepodařilo otevřít.");
  }
}
