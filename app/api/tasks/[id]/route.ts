import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dateValue, text } from "@/lib/forms";
import { audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";
import { canEditTask } from "@/lib/task-access";
import { serializableTransaction } from "@/lib/serializable";
import { taskStatuses, taskPriorities } from "@/lib/labels";

const statuses = new Set(["OPEN", "IN_PROGRESS", "WAITING", "CANCELLED"]);
const priorities = new Set(["LOW", "NORMAL", "HIGH", "URGENT"]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return go(request, "/login");
  const { id } = await params;
  const task = await prisma.task.findUnique({ where: { id }, include: { lease: { select: { unitId: true } }, conditionPlanExecution: { select: { id: true } } } });
  if (!task) return goWithMessage(request, "/ukoly", "error", "Úkol nebyl nalezen.");
  if (!(await canEditTask(user, task))) return goWithMessage(request, `/ukoly/${id}`, "error", "Nemáte oprávnění upravit tento úkol.");
  try {
    const form = await request.formData();
    const requestedStatus = text(form, "status");
    if (task.conditionPlanExecution && requestedStatus && requestedStatus !== task.status) throw new Error("Stav CAPEX realizace měňte v modulu Kvalita a CAPEX.");
    if (requestedStatus === "DONE" && task.status !== "DONE") throw new Error("Úkol lze dokončit pouze přes uzavření se závěrečným komentářem.");
    const status = task.status === "DONE" || task.status === "CANCELLED" ? task.status : (requestedStatus || task.status);
    const priority = text(form, "priority") || task.priority;
    if (status !== "DONE" && !statuses.has(status)) throw new Error("Neplatný stav úkolu.");
    if (!priorities.has(priority)) throw new Error("Neplatná priorita úkolu.");
    const dueAt = dateValue(form, "dueAt");
    const assigneeId = text(form, "assigneeId");
    const title = text(form, "title") || task.title;
    const description = text(form, "description");
    if (assigneeId) {
      const assignee = await prisma.user.findFirst({
        where: {
          id: assigneeId,
          active: true,
          OR: [
            { role: { in: ["SUPER_ADMIN", "MANAGER"] } },
            { allProperties: true },
            { memberships: { some: { propertyId: task.propertyId } } },
            { unitMemberships: { some: { unit: { propertyId: task.propertyId } } } },
          ],
        },
        select: { id: true },
      });
      if (!assignee) throw new Error("Vybraný řešitel nemá přístup k této nemovitosti.");
    }
    const closing = status === "DONE" || status === "CANCELLED";
    await serializableTransaction(async tx => {
      const claim = await tx.task.updateMany({ where: { id, updatedAt: task.updatedAt, status: task.status }, data: { status: status as typeof task.status, priority: priority as typeof task.priority, dueAt, assigneeId: assigneeId || null, title, description, closedAt: closing ? (task.closedAt || new Date()) : null } });
      if (claim.count !== 1) throw new Error("Úkol se mezitím změnil. Obnovte detail a změnu zkontrolujte.");
      await tx.taskEntry.create({ data: { taskId: id, authorId: user.id, kind: "STATUS", body: `Aktualizace úkolu: stav ${taskStatuses[status as typeof task.status]}, priorita ${taskPriorities[priority as typeof task.priority]}${dueAt ? `, termín ${dueAt.toLocaleDateString("cs-CZ")}` : ""}.` } });
    });
    await audit(user.id, "TASK_UPDATED", "Task", id, { status, priority }, task.propertyId);
    return goWithMessage(request, `/ukoly/${id}`, "ok", "Úkol byl aktualizován.");
  } catch (error) {
    return goWithMessage(request, `/ukoly/${id}`, "error", error instanceof Error ? error.message : "Úkol se nepodařilo upravit.");
  }
}
