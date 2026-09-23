import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { go, goWithMessage, safeInternalReturnPath } from "@/lib/route-response";
import { taskAccessWhere } from "@/lib/access";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return go(request, "/login");
  const { id } = await params;
  const task = await prisma.task.findFirst({ where: { id, ...taskAccessWhere(user) }, select: { id: true } });
  if (!task) return goWithMessage(request, "/ukoly", "error", "Úkol nebyl nalezen.");
  const form = await request.formData();
  const action = String(form.get("action") || "");
  if (!["favorite", "unfavorite", "dismiss", "restore"].includes(action)) return goWithMessage(request, "/ukoly", "error", "Neplatná akce.");
  await prisma.taskUserState.upsert({
    where: { taskId_userId: { taskId: id, userId: user.id } },
    create: { taskId: id, userId: user.id, favorite: action === "favorite", dismissedAt: action === "dismiss" ? new Date() : null },
    update: action === "favorite" ? { favorite: true } : action === "unfavorite" ? { favorite: false } : action === "dismiss" ? { dismissedAt: new Date() } : { dismissedAt: null },
  });
  const fallback = action === "dismiss" ? "/portfolio" : "/ukoly";
  return goWithMessage(request, safeInternalReturnPath(form.get("returnTo"), fallback), "ok", action === "dismiss" ? "Úkol už se na hlavní stránce nezobrazuje." : "Osobní nastavení úkolu bylo uloženo.");
}
