import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { serializableTransaction } from "@/lib/serializable";
import { tenantAnnouncementManagerScope } from "@/lib/tenant-portal-messages";
import { goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, target = "/ukoly/oznameni/najemnici";
  try {
    const user = await currentUser();
    if (!user || request.headers.get("sec-fetch-site") === "cross-site") throw new Error("Nemáte oprávnění upravit oznámení.");
    const { where } = await tenantAnnouncementManagerScope(user);
    const before = await prisma.announcement.findFirst({ where: { id, ...where } });
    if (!before) throw new Error("Oznámení není dostupné v rozsahu vašeho oprávnění.");
    const form = await request.formData(), action = String(form.get("action") || "");
    if (form.get("revision") !== before.updatedAt.toISOString()) throw new Error("Oznámení se změnilo. Obnovte stránku.");
    if (!["edit", "deactivate", "activate"].includes(action)) throw new Error("Neplatná akce.");
    const title = String(form.get("title") || "").trim(), body = String(form.get("body") || "").trim();
    if (action === "edit" && (!title || title.length > 200 || !body || body.length > 5000)) throw new Error("Vyplňte název do 200 a sdělení do 5 000 znaků.");
    await serializableTransaction(async tx => {
      const changed = await tx.announcement.updateMany({ where: { id, updatedAt: before.updatedAt }, data: action === "edit" ? { title, body } : { active: action === "activate" } });
      if (changed.count !== 1) throw new Error("Oznámení se mezitím změnilo.");
      if (action === "edit") await tx.announcementUserState.updateMany({ where: { announcementId: id }, data: { readAt: null, dismissedAt: null } });
      await tx.auditLog.create({ data: { userId: user.id, action: `TENANT_ANNOUNCEMENT_${action.toUpperCase()}`, entityType: "Announcement", entityId: id, details: { before: { title: before.title, body: before.body, active: before.active }, ...(action === "edit" ? { title, body } : {}) } } });
    });
    return goWithMessage(request, `${target}#${id}`, "ok", action === "deactivate" ? "Oznámení bylo staženo z portálů nájemníků." : "Oznámení bylo upraveno.");
  } catch (error) { return goWithMessage(request, target, "error", error instanceof Error ? error.message : "Úprava se nezdařila."); }
}
