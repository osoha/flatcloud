import bcrypt from "bcryptjs";
import { PropertyPermission, UserRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { audit } from "@/lib/management";
import { goWithMessage } from "@/lib/route-response";

export async function POST(request: Request) {
  const admin = await currentUser();
  if (!admin || admin.role !== "SUPER_ADMIN") return goWithMessage(request, "/login", "error", "Přístup byl odepřen.");
  try {
    const form = await request.formData();
    const name = String(form.get("name") || "").trim();
    const email = String(form.get("email") || "").trim().toLowerCase();
    const password = String(form.get("password") || "");
    const roleRaw = String(form.get("role") || UserRole.OWNER_VIEWER) as UserRole;
    const role = Object.values(UserRole).includes(roleRaw) ? roleRaw : UserRole.OWNER_VIEWER;
    const propertyId = String(form.get("propertyId") || "").trim();
    const permissionRaw = String(form.get("permission") || PropertyPermission.VIEW) as PropertyPermission;
    const permission = Object.values(PropertyPermission).includes(permissionRaw) ? permissionRaw : PropertyPermission.VIEW;
    if (!name || !/^\S+@\S+\.\S+$/.test(email)) throw new Error("Jméno a platný e-mail jsou povinné.");
    if (password.length < 12) throw new Error("Dočasné heslo musí mít alespoň 12 znaků.");
    if (await prisma.user.findUnique({ where: { email } })) throw new Error("Uživatel s tímto e-mailem už existuje.");
    if (propertyId && !(await prisma.property.findUnique({ where: { id: propertyId }, select: { id: true } }))) throw new Error("Vybraná nemovitost neexistuje.");
    const passwordHash = await bcrypt.hash(password, 12);
    const created = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        role,
        active: true,
        memberships: propertyId && role !== UserRole.SUPER_ADMIN && role !== UserRole.MANAGER ? { create: { propertyId, permission } } : undefined,
      },
    });
    await audit(admin.id, "USER_CREATED", "User", created.id, { email, role, propertyId: propertyId || null, permission: propertyId ? permission : null });
    return goWithMessage(request, "/uzivatele", "ok", `Uživatel ${email} byl vytvořen.`);
  } catch (error) {
    return goWithMessage(request, "/uzivatele", "error", error instanceof Error ? error.message : "Uživatele se nepodařilo vytvořit.");
  }
}
