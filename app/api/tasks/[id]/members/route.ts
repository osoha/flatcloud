import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canEditTask, taskParticipantWhere, authoritativeTaskUnitId } from "@/lib/task-access";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return go(request, "/login");
  const { id } = await params;
  const task = await prisma.task.findUnique({ where: { id }, include: { lease: { select: { unitId: true } } } });
  if (!task || !(await canEditTask(user, task))) return goWithMessage(request, `/ukoly/${id}`, "error", "Nemáte oprávnění spravovat účastníky.");
  const form = await request.formData();
  const action = String(form.get("action") || "add");
  const userId = String(form.get("userId") || "");
  if (!userId) return goWithMessage(request, `/ukoly/${id}`, "error", "Vyberte uživatele.");
  if (action === "assign") {
    const target = await prisma.user.findFirst({ where: { id: userId, ...(task.propertyId ? taskParticipantWhere(task.propertyId, authoritativeTaskUnitId(task)) : { active: true, role: { not: "TENANT" as const } }) }, select: { id: true } });
    if (!target) return goWithMessage(request, `/ukoly/${id}`, "error", "Vybraný odpovědný nemá přístup k tomuto úkolu.");
    if (String(form.get("revision") || "") !== task.updatedAt.toISOString()) return goWithMessage(request, `/ukoly/${id}`, "error", "Úkol se mezitím změnil. Obnovte stránku.");
    const changed = await prisma.$transaction(async tx => {
      const result = await tx.task.updateMany({ where: { id, updatedAt: task.updatedAt }, data: { assigneeId: userId } });
      if (result.count) await tx.auditLog.create({ data: { userId: user.id, propertyId: task.propertyId, action: "TASK_ASSIGNEE_CHANGED", entityType: "Task", entityId: id, details: { before: task.assigneeId, after: userId } } });
      return result.count;
    });
    return goWithMessage(request, `/ukoly/${id}`, changed ? "ok" : "error", changed ? "Odpovědný byl přiřazen." : "Úkol se mezitím změnil. Obnovte stránku.");
  }
  if (action === "remove") {
    await prisma.taskMember.deleteMany({ where: { taskId: id, userId } });
  } else {
    const role = String(form.get("role") || "COLLABORATOR");
    if (!["COLLABORATOR", "WATCHER"].includes(role)) return goWithMessage(request, `/ukoly/${id}`, "error", "Neplatná role účastníka.");
    const target = await prisma.user.findFirst({ where: { id:userId,...(task.propertyId?taskParticipantWhere(task.propertyId,authoritativeTaskUnitId(task)):{active:true}) }, select: { id: true } });
    if (!target) return goWithMessage(request, `/ukoly/${id}`, "error", task.propertyId ? "Uživatel nemá přístup k této nemovitosti." : "Uživatel není aktivní.");
    await prisma.taskMember.upsert({ where: { taskId_userId: { taskId: id, userId } }, create: { taskId: id, userId, role: role as "COLLABORATOR" | "WATCHER" }, update: { role: role as "COLLABORATOR" | "WATCHER" } });
  }
  await prisma.auditLog.create({ data: { userId: user.id, propertyId: task.propertyId, action: action === "remove" ? "TASK_MEMBER_REMOVED" : "TASK_MEMBER_UPDATED", entityType: "Task", entityId: id, details: { memberUserId: userId, role: String(form.get("role") || "") } } });
  return goWithMessage(request, `/ukoly/${id}`, "ok", action === "remove" ? "Účastník byl odebrán." : "Účastník byl uložen.");
}
