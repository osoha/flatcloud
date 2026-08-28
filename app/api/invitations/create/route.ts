import { PropertyPermission, UserRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { sendInvitationEmail } from "@/lib/email";
import { propertyPermissions } from "@/lib/labels";
import { redirectUrl } from "@/lib/redirect-url";
import { audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";
import { canonicalizeAccessScope, grantUserAccess, rotateInvitation } from "@/lib/user-access-management";

export async function POST(request: Request) {
  const admin = await currentUser();
  if (!admin || admin.role !== UserRole.SUPER_ADMIN) return go(request, "/login");
  try {
    const form = await request.formData();
    const name = String(form.get("name") || "").trim();
    const email = String(form.get("email") || "").trim().toLowerCase();
    const allProperties = form.get("allProperties") === "on";
    const propertyIds = form.getAll("propertyIds").map(String).filter(Boolean);
    const unitIds = form.getAll("unitIds").map(String).filter(Boolean);
    const permission = Object.values(PropertyPermission).includes(form.get("permission") as PropertyPermission) ? form.get("permission") as PropertyPermission : PropertyPermission.VIEW;
    const role = Object.values(UserRole).includes(form.get("role") as UserRole) ? form.get("role") as UserRole : UserRole.OWNER_VIEWER;
    if (!name || !/^\S+@\S+\.\S+$/.test(email)) throw new Error("Jméno a platný e-mail jsou povinné.");
    if (!allProperties && !propertyIds.length && !unitIds.length && role !== UserRole.MANAGER && role !== UserRole.SUPER_ADMIN) throw new Error("Vyberte rozsah přístupu.");
    const [properties, units, existing] = await Promise.all([
      prisma.property.findMany({ where: { id: { in: propertyIds }, active: true }, select: { id: true, name: true } }),
      prisma.unit.findMany({ where: { id: { in: unitIds }, property: { active: true } }, select: { id: true, label: true, property: { select: { id: true, name: true } } } }),
      prisma.user.findUnique({ where: { email }, select: { id: true, role: true, allProperties: true, active: true } }),
    ]);
    if (properties.length !== propertyIds.length || units.length !== unitIds.length) throw new Error("Některý vybraný objekt nebo jednotka neexistuje.");
    if (existing && !existing.active) throw new Error("Uživatel je deaktivovaný. Nejprve účet znovu aktivujte.");
    const scope = canonicalizeAccessScope({ role, permission, allProperties, propertyIds, unitIds });
    if (existing) {
      const result = await grantUserAccess(existing, scope);
      await audit(admin.id, "USER_ACCESS_GRANTED", "User", existing.id, { email, ...scope });
      return goWithMessage(request, "/uzivatele", "ok", result.changed ? "Uživatel již měl účet; požadovaný přístup byl přidán." : "Uživatel již má požadovaný přístup.");
    }
    const primary = properties[0] || units[0]?.property || await prisma.property.findFirst({ where: { active: true }, select: { id: true, name: true } });
    if (!primary) throw new Error("Nejprve vytvořte nemovitost.");
    const { invitation, token } = await rotateInvitation({ createMode: "GLOBAL_EMAIL", email, name, propertyId: primary.id, ...scope, invitedById: admin.id });
    const inviteUrl = redirectUrl(`/pozvanka/${token}`, request).toString();
    const propertyName = scope.allProperties ? "všem nemovitostem FlatCloud" : [...properties.map((p) => p.name), ...units.map((u) => `${u.property.name} / ${u.label}`)].join(", ");
    const result = await sendInvitationEmail({ to: email, inviterName: admin.name, propertyName, permissionLabel: propertyPermissions[permission], inviteUrl });
    await audit(admin.id, "USER_INVITED", "UserInvitation", invitation.id, { email, ...scope, sent: result.sent });
    const message = result.sent ? `Pozvánka byla odeslána na ${email}.` : "Pozvánka byla vytvořena; SMTP není nakonfigurováno.";
    return go(request, `/uzivatele?ok=${encodeURIComponent(message)}${result.sent ? "" : `&invite=${encodeURIComponent(inviteUrl)}`}`);
  } catch (error) { return goWithMessage(request, "/uzivatele", "error", error instanceof Error ? error.message : "Přístup se nepodařilo přidat."); }
}
