import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return go(request, "/login");
  if (user.role !== "SUPER_ADMIN") return goWithMessage(request, "/portfolio", "error", "Oznámení může spravovat pouze super-admin.");
  const { id } = await params;
  const form = await request.formData();
  const action = String(form.get("action") || "");
  if (!["activate", "deactivate"].includes(action)) return goWithMessage(request, "/nastaveni/oznameni", "error", "Neplatná akce.");
  const active = action === "activate";
  const result = await prisma.announcement.updateMany({ where: { id }, data: { active } });
  if (!result.count) return goWithMessage(request, "/nastaveni/oznameni", "error", "Oznámení nebylo nalezeno.");
  await prisma.auditLog.create({ data: { userId: user.id, action: active ? "ANNOUNCEMENT_ACTIVATED" : "ANNOUNCEMENT_DEACTIVATED", entityType: "Announcement", entityId: id } });
  return goWithMessage(request, `/nastaveni/oznameni#${id}`, "ok", active ? "Oznámení bylo znovu aktivováno." : "Oznámení bylo ukončeno.");
}
