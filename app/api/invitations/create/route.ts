import { PropertyPermission } from "@prisma/client";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { invitationToken } from "@/lib/invitations";
import { sendInvitationEmail } from "@/lib/email";
import { propertyPermissions } from "@/lib/labels";
import { redirectUrl } from "@/lib/redirect-url";
import { audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request) {
  const admin = await currentUser();
  if (!admin || admin.role !== "SUPER_ADMIN") return go(request, "/login");
  try {
    const form = await request.formData();
    const name = String(form.get("name") || "").trim() || null;
    const email = String(form.get("email") || "").trim().toLowerCase();
    const propertyId = String(form.get("propertyId") || "").trim();
    const rawPermission = String(form.get("permission") || PropertyPermission.VIEW) as PropertyPermission;
    const permission = Object.values(PropertyPermission).includes(rawPermission) ? rawPermission : PropertyPermission.VIEW;
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Zadejte platný e-mail.");
    if (!propertyId) throw new Error("Vyberte nemovitost.");
    const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { id: true, name: true } });
    if (!property) throw new Error("Nemovitost nebyla nalezena.");
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing && await prisma.userProperty.findUnique({ where: { userId_propertyId: { userId: existing.id, propertyId } } })) throw new Error("Uživatel už má k této nemovitosti přístup.");
    await prisma.userInvitation.updateMany({ where: { propertyId, email, status: "PENDING" }, data: { status: "REVOKED" } });
    const { token, tokenHash } = invitationToken();
    const invitation = await prisma.userInvitation.create({
      data: { email, name, tokenHash, propertyId, permission, invitedById: admin.id, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    });
    const inviteUrl = redirectUrl(`/pozvanka/${token}`, request).toString();
    const result = await sendInvitationEmail({ to: email, inviterName: admin.name, propertyName: property.name, permissionLabel: propertyPermissions[permission], inviteUrl });
    await audit(admin.id, "USER_INVITED", "UserInvitation", invitation.id, { propertyId, email, permission, sent: result.sent });
    const message = result.sent ? `Pozvánka byla odeslána na ${email}.` : "Pozvánka byla vytvořena, ale SMTP není nakonfigurováno. Odkaz je zobrazen níže.";
    return go(request, `/uzivatele?ok=${encodeURIComponent(message)}${result.sent ? "" : `&invite=${encodeURIComponent(inviteUrl)}`}`);
  } catch (error) {
    return goWithMessage(request, "/uzivatele", "error", error instanceof Error ? error.message : "Pozvánku se nepodařilo odeslat.");
  }
}
