import { PropertyPermission } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePropertyAdmin, audit } from "@/lib/management";
import { canSeeAll } from "@/lib/auth";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const { id, userId } = await params;
  const access = await requirePropertyAdmin(id);
  if (!access) return go(request, "/login");
  try {
    const form = await request.formData();
    const mode = String(form.get("mode") || "save");
    if (mode === "remove") {
      if (!canSeeAll(access.user.role) && userId === access.user.id) throw new Error("Nemůžete odebrat vlastní administrátorský přístup.");
      await prisma.userProperty.delete({ where: { userId_propertyId: { userId, propertyId: id } } });
      await audit(access.user.id, "PROPERTY_ACCESS_REMOVED", "UserProperty", `${userId}:${id}`, { propertyId: id, userId });
      return goWithMessage(request, `/nemovitosti/${id}/uzivatele`, "ok", "Přístup uživatele byl odebrán.");
    }
    const raw = String(form.get("permission") || "VIEW") as PropertyPermission;
    let selected = Object.values(PropertyPermission).includes(raw) ? raw : PropertyPermission.VIEW;
    if (!canSeeAll(access.user.role) && selected === PropertyPermission.ADMIN) selected = PropertyPermission.EDIT;
    await prisma.userProperty.update({ where: { userId_propertyId: { userId, propertyId: id } }, data: { permission: selected } });
    await audit(access.user.id, "PROPERTY_ACCESS_UPDATED", "UserProperty", `${userId}:${id}`, { propertyId: id, userId, permission: selected });
    return goWithMessage(request, `/nemovitosti/${id}/uzivatele`, "ok", "Oprávnění bylo změněno.");
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/uzivatele`, "error", error instanceof Error ? error.message : "Oprávnění se nepodařilo změnit.");
  }
}
