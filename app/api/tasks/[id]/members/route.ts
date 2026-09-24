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
