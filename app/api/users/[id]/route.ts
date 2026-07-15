import { PropertyPermission, UserRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await currentUser();
  if (!admin || admin.role !== "SUPER_ADMIN") return go(request, "/login");
  const { id } = await params;
  try {
    const form = await request.formData();
    const name = String(form.get("name") || "").trim();
    const email = String(form.get("email") || "").trim().toLowerCase();
    const roleRaw = String(form.get("role") || "OWNER_VIEWER") as UserRole;
    const role = Object.values(UserRole).includes(roleRaw) ? roleRaw : UserRole.OWNER_VIEWER;
    const active = form.get("active") === "on";
    if (!name || !/^\S+@\S+\.\S+$/.test(email)) throw new Error("Jméno a platný e-mail jsou povinné.");
    if (id === admin.id && (!active || role !== UserRole.SUPER_ADMIN)) throw new Error("U vlastního účtu nelze odebrat roli hlavního administrátora ani ho deaktivovat.");
    const properties = await prisma.property.findMany({ select: { id: true } });
    const memberships = properties.flatMap((property) => {
      const value = String(form.get(`property:${property.id}`) || "") as PropertyPermission;
      return Object.values(PropertyPermission).includes(value) ? [{ propertyId: property.id, permission: value }] : [];
    });
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { name, email, role, active } });
      await tx.userProperty.deleteMany({ where: { userId: id } });
      if (memberships.length) await tx.userProperty.createMany({ data: memberships.map((membership) => ({ userId: id, ...membership })) });
    });
    await audit(admin.id, "USER_UPDATED", "User", id, { email, role, active, memberships });
    return goWithMessage(request, `/uzivatele/${id}`, "ok", "Uživatel a jeho oprávnění byli uloženi.");
  } catch (error) {
    return goWithMessage(request, `/uzivatele/${id}`, "error", error instanceof Error ? error.message : "Uživatele se nepodařilo uložit.");
  }
}
