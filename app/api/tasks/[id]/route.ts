import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dateValue, text } from "@/lib/forms";
import { audit, hasPropertyPermission } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";

const statuses = new Set(["OPEN", "IN_PROGRESS", "WAITING", "DONE", "CANCELLED"]);
const priorities = new Set(["LOW", "NORMAL", "HIGH", "URGENT"]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return go(request, "/login");
  const { id } = await params;
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return goWithMessage(request, "/ukoly", "error", "Úkol nebyl nalezen.");
  if (!(await hasPropertyPermission(user, task.propertyId, "EDIT"))) return goWithMessage(request, `/ukoly/${id}`, "error", "Nemáte oprávnění upravit tento úkol.");
  try {
    const form = await request.formData();
    const status = text(form, "status") || task.status;
    const priority = text(form, "priority") || task.priority;
    if (!statuses.has(status)) throw new Error("Neplatný stav úkolu.");
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
    await prisma.$transaction([
      prisma.task.update({ where: { id }, data: { status: status as typeof task.status, priority: priority as typeof task.priority, dueAt, assigneeId: assigneeId || null, title, description, closedAt: closing ? (task.closedAt || new Date()) : null } }),
      prisma.taskEntry.create({ data: { taskId: id, authorId: user.id, kind: "STATUS", body: `Aktualizace úkolu: stav ${status}, priorita ${priority}${dueAt ? `, termín ${dueAt.toLocaleDateString("cs-CZ")}` : ""}.` } }),
    ]);
    await audit(user.id, "TASK_UPDATED", "Task", id, { status, priority }, task.propertyId);
    return goWithMessage(request, `/ukoly/${id}`, "ok", "Úkol byl aktualizován.");
  } catch (error) {
    return goWithMessage(request, `/ukoly/${id}`, "error", error instanceof Error ? error.message : "Úkol se nepodařilo upravit.");
  }
}
