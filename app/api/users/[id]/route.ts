import { PropertyPermission, UserRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";
import { processAvatarUpload } from "@/lib/avatar";
import { editableUserAccessChanged } from "@/lib/user-access-management";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await currentUser();
  if (!admin || admin.role !== "SUPER_ADMIN") return go(request, "/login");
  const { id } = await params;

  try {
    const form = await request.formData();
    const name = String(form.get("name") || "").trim();
    const email = String(form.get("email") || "").trim().toLowerCase();
    const phone = String(form.get("phone") || "").trim() || null;
    const title = String(form.get("title") || "").trim() || null;
    const roleRaw = String(form.get("role") || "OWNER_VIEWER") as UserRole;
    const role = Object.values(UserRole).includes(roleRaw) ? roleRaw : UserRole.OWNER_VIEWER;
    const active = form.get("active") === "on";
    const allProperties = form.get("allProperties") === "on" || role === UserRole.SUPER_ADMIN || role === UserRole.MANAGER;

    if (!name || !/^\S+@\S+\.\S+$/.test(email)) throw new Error("Jméno a platný e-mail jsou povinné.");
    if (id === admin.id && (!active || role !== UserRole.SUPER_ADMIN)) {
      throw new Error("U vlastního účtu nelze odebrat roli hlavního administrátora ani ho deaktivovat.");
    }

    let avatarUpdate: { avatarData?: Uint8Array<ArrayBuffer> | null; avatarMimeType?: string | null } = {};
    const removeAvatar = form.get("removeAvatar") === "on";
    if (removeAvatar) {
      avatarUpdate = { avatarData: null, avatarMimeType: null };
    } else {
      const processedAvatar = await processAvatarUpload(form.get("avatar"));
      if (processedAvatar) avatarUpdate = processedAvatar;
    }

    const properties = await prisma.property.findMany({ select: { id: true } });
    const units = await prisma.unit.findMany({ select: { id: true } });
    const memberships = allProperties ? [] : properties.flatMap((property) => {
      const value = String(form.get(`property:${property.id}`) || "") as PropertyPermission;
      return Object.values(PropertyPermission).includes(value) ? [{ propertyId: property.id, permission: value }] : [];
    });
    const unitMemberships = allProperties ? [] : units.flatMap((unit) => {
      const value = String(form.get(`unit:${unit.id}`) || "") as PropertyPermission;
      return Object.values(PropertyPermission).includes(value) ? [{ unitId: unit.id, permission: value }] : [];
    });

    await prisma.$transaction(async (tx) => {
      const current = await tx.user.findUnique({ where: { id }, select: { active: true, role: true, allProperties: true, memberships: { select: { propertyId: true, permission: true } }, unitMemberships: { select: { unitId: true, permission: true } } } });
      if (!current) throw new Error("Uživatel nebyl nalezen.");
      if (current.active && current.role === UserRole.SUPER_ADMIN && (!active || role !== UserRole.SUPER_ADMIN)) {
        const activeSuperAdmins = await tx.user.count({ where: { active: true, role: UserRole.SUPER_ADMIN } });
        if (activeSuperAdmins <= 1) throw new Error("Posledního aktivního hlavního administrátora nelze deaktivovat ani změnit jeho roli.");
      }
      if (editableUserAccessChanged(current, { role, active, allProperties, memberships, unitMemberships }) && form.get("confirmAccessChange") !== "on") {
        throw new Error("Změnu efektivního přístupu je nutné výslovně potvrdit.");
      }
      await tx.user.update({ where: { id }, data: { name, email, phone, title, role, active, allProperties, ...avatarUpdate } });
      await tx.userProperty.deleteMany({ where: { userId: id } });
      await tx.userUnit.deleteMany({ where: { userId: id } });
      if (memberships.length) await tx.userProperty.createMany({ data: memberships.map((membership) => ({ userId: id, ...membership })) });
      if (unitMemberships.length) await tx.userUnit.createMany({ data: unitMemberships.map((membership) => ({ userId: id, ...membership })) });
    }, { isolationLevel: "Serializable" });

    await audit(admin.id, "USER_UPDATED", "User", id, { email, role, active, allProperties, memberships, unitMemberships, avatarChanged: Object.keys(avatarUpdate).length > 0 });
    return goWithMessage(request, `/uzivatele/${id}`, "ok", "Uživatel a jeho oprávnění byli uloženi.");
  } catch (error) {
    return goWithMessage(request, `/uzivatele/${id}`, "error", error instanceof Error ? error.message : "Uživatele se nepodařilo uložit.");
  }
}
