import { PropertyPermission, UserRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePropertyAdmin, audit } from "@/lib/management";
import { canSeeAll } from "@/lib/auth";
import { propertyPermissions } from "@/lib/labels";
import { sendInvitationEmail } from "@/lib/email";
import { redirectUrl } from "@/lib/redirect-url";
import { go, goWithMessage } from "@/lib/route-response";
import { grantUserAccess, rotateInvitation } from "@/lib/user-access-management";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requirePropertyAdmin(id);
  if (!access) return go(request, "/login");
  try {
    const form = await request.formData();
    const email = String(form.get("email") || "").trim().toLowerCase();
    const name = String(form.get("name") || "").trim() || null;
    let permission = Object.values(PropertyPermission).includes(form.get("permission") as PropertyPermission) ? form.get("permission") as PropertyPermission : PropertyPermission.VIEW;
    if (!canSeeAll(access.user.role) && permission === PropertyPermission.ADMIN) permission = PropertyPermission.EDIT;
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Zadejte platný e-mail.");
    const [property, existing] = await Promise.all([prisma.property.findUnique({ where: { id }, select: { id: true, name: true } }), prisma.user.findUnique({ where: { email }, select: { id: true, role: true, allProperties: true, active: true } })]);
    if (!property) throw new Error("Nemovitost nebyla nalezena.");
    if (existing && !existing.active) throw new Error("Uživatel je deaktivovaný. Nejprve účet znovu aktivujte.");
    if (existing) {
      const result = await grantUserAccess(existing, { role: UserRole.OWNER_VIEWER, permission, allProperties: false, propertyIds: [id], unitIds: [] });
      await audit(access.user.id, "USER_ACCESS_GRANTED", "User", existing.id, { propertyId: id, email, permission }, id);
      return goWithMessage(request, `/nemovitosti/${id}/uzivatele`, "ok", result.changed ? "Uživatel již měl účet; požadovaný přístup byl přidán." : "Uživatel již má požadovaný přístup.");
    }
    const { invitation, token } = await rotateInvitation({ createMode: "PROPERTY_LOCAL", email, name, propertyId: id, propertyIds: [id], unitIds: [], allProperties: false, permission, role: UserRole.OWNER_VIEWER, invitedById: access.user.id });
    const inviteUrl = redirectUrl(`/pozvanka/${token}`, request).toString();
    const result = await sendInvitationEmail({ to: email, inviterName: access.user.name, propertyName: property.name, permissionLabel: propertyPermissions[permission], inviteUrl });
    await audit(access.user.id, "USER_INVITED", "UserInvitation", invitation.id, { propertyId: id, email, permission, sent: result.sent }, id);
    const message = result.sent ? `Pozvánka byla odeslána na ${email}.` : "Pozvánka vytvořena; SMTP není nakonfigurováno.";
    return go(request, `/nemovitosti/${id}/uzivatele?ok=${encodeURIComponent(message)}${result.sent ? "" : `&invite=${encodeURIComponent(inviteUrl)}`}`);
  } catch (error) { return goWithMessage(request, `/nemovitosti/${id}/uzivatele`, "error", error instanceof Error ? error.message : "Člena se nepodařilo přidat."); }
}
