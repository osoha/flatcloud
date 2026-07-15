import { PropertyPermission } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePropertyAdmin, audit } from "@/lib/management";
import { canSeeAll } from "@/lib/auth";
import { invitationToken } from "@/lib/invitations";
import { propertyPermissions } from "@/lib/labels";
import { sendInvitationEmail } from "@/lib/email";
import { redirectUrl } from "@/lib/redirect-url";
import { go, goWithMessage } from "@/lib/route-response";

function permission(value: FormDataEntryValue | null) {
  return Object.values(PropertyPermission).includes(value as PropertyPermission) ? value as PropertyPermission : PropertyPermission.VIEW;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requirePropertyAdmin(id);
  if (!access) return go(request, "/login");
  try {
    const form = await request.formData();
    const email = String(form.get("email") || "").trim().toLowerCase();
    const name = String(form.get("name") || "").trim() || null;
    let selectedPermission = permission(form.get("permission"));
    if (!canSeeAll(access.user.role) && selectedPermission === PropertyPermission.ADMIN) selectedPermission = PropertyPermission.EDIT;
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new Error("Zadejte platnou e-mailovou adresu.");
    const property = await prisma.property.findUnique({ where: { id }, select: { name: true } });
    if (!property) throw new Error("Nemovitost nebyla nalezena.");
    const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existingUser) {
      const existingMembership = await prisma.userProperty.findUnique({ where: { userId_propertyId: { userId: existingUser.id, propertyId: id } } });
      if (existingMembership) throw new Error("Tento uživatel už má k nemovitosti přístup.");
    }
    await prisma.userInvitation.updateMany({ where: { propertyId: id, email, status: "PENDING" }, data: { status: "REVOKED" } });
    const { token, tokenHash } = invitationToken();
    const invitation = await prisma.userInvitation.create({
      data: { email, name, tokenHash, propertyId: id, permission: selectedPermission, invitedById: access.user.id, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    });
    const inviteUrl = redirectUrl(`/pozvanka/${token}`, request).toString();
    const result = await sendInvitationEmail({ to: email, inviterName: access.user.name, propertyName: property.name, permissionLabel: propertyPermissions[selectedPermission], inviteUrl });
    await audit(access.user.id, "USER_INVITED", "UserInvitation", invitation.id, { propertyId: id, email, permission: selectedPermission, sent: result.sent });
    const message = result.sent ? `Pozvánka byla odeslána na ${email}.` : `Pozvánka vytvořena. E-mail není nakonfigurován; zkopírujte odkaz níže.`;
    const target = `/nemovitosti/${id}/uzivatele?ok=${encodeURIComponent(message)}${result.sent ? "" : `&invite=${encodeURIComponent(inviteUrl)}`}`;
    return go(request, target);
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/uzivatele`, "error", error instanceof Error ? error.message : "Pozvánku se nepodařilo vytvořit.");
  }
}
