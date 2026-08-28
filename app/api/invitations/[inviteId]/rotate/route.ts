import { PropertyPermission, UserRole } from "@prisma/client";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requirePropertyAdmin, audit } from "@/lib/management";
import { propertyPermissions } from "@/lib/labels";
import { sendInvitationEmail } from "@/lib/email";
import { redirectUrl } from "@/lib/redirect-url";
import { rotateInvitation } from "@/lib/user-access-management";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ inviteId: string }> }) {
  const { inviteId } = await params;
  const actor = await currentUser();
  if (!actor) return go(request, "/login");
  const old = await prisma.userInvitation.findUnique({ where: { id: inviteId }, include: { property: true } });
  if (!old || old.status !== "PENDING") return goWithMessage(request, "/uzivatele", "error", "Pozvánka už není aktivní.");
  const global = actor.role === UserRole.SUPER_ADMIN;
  if (!global && !(await requirePropertyAdmin(old.propertyId))) return go(request, "/portfolio");
  const form = await request.formData();
  const returnTo = global && String(form.get("returnTo")) === "/uzivatele" ? "/uzivatele" : `/nemovitosti/${old.propertyId}/uzivatele`;
  try {
    const edit = form.get("mode") === "edit";
    let permission = edit && Object.values(PropertyPermission).includes(form.get("permission") as PropertyPermission) ? form.get("permission") as PropertyPermission : old.permission;
    if (!global && permission === PropertyPermission.ADMIN) permission = PropertyPermission.EDIT;
    const role = global && edit && Object.values(UserRole).includes(form.get("role") as UserRole) ? form.get("role") as UserRole : old.role;
    if (!global && (role === UserRole.MANAGER || role === UserRole.SUPER_ADMIN)) throw new Error("Nemáte oprávnění udělit globální roli.");
    const propertyIds = global && edit ? form.getAll("propertyIds").map(String).filter(Boolean) : old.propertyIds;
    const unitIds = global && edit ? form.getAll("unitIds").map(String).filter(Boolean) : old.unitIds;
    const allProperties = global && edit ? form.get("allProperties") === "on" : old.allProperties;
    if (global && edit) {
      const [propertyCount, unitCount] = await Promise.all([prisma.property.count({ where: { id: { in: propertyIds }, active: true } }), prisma.unit.count({ where: { id: { in: unitIds }, property: { active: true } } })]);
      if (propertyCount !== new Set(propertyIds).size || unitCount !== new Set(unitIds).size) throw new Error("Některý vybraný objekt nebo jednotka neexistuje.");
      if (!allProperties && !propertyIds.length && !unitIds.length && role !== UserRole.MANAGER && role !== UserRole.SUPER_ADMIN) throw new Error("Vyberte rozsah přístupu.");
    }
    const { invitation, token } = await rotateInvitation({ replaceId: old.id, email: old.email, name: old.name, propertyId: old.propertyId, propertyIds, unitIds, allProperties, permission, role, invitedById: actor.id });
    const inviteUrl = redirectUrl(`/pozvanka/${token}`, request).toString();
    const result = await sendInvitationEmail({ to: old.email, inviterName: actor.name, propertyName: allProperties ? "všem nemovitostem FlatCloud" : old.property.name, permissionLabel: propertyPermissions[permission], inviteUrl });
    await audit(actor.id, edit ? "USER_INVITATION_EDITED" : "USER_INVITATION_RESENT", "UserInvitation", invitation.id, { replacedInvitationId: old.id, role, permission, propertyIds, unitIds, allProperties, sent: result.sent }, old.propertyId);
    const message = edit ? "Oprávnění byla upravena a byla odeslána nová pozvánka." : "Pozvánka byla znovu odeslána s novým odkazem.";
    return go(request, `${returnTo}?ok=${encodeURIComponent(message)}${result.sent ? "" : `&invite=${encodeURIComponent(inviteUrl)}`}`);
  } catch (error) { return goWithMessage(request, returnTo, "error", error instanceof Error ? error.message : "Pozvánku se nepodařilo obnovit."); }
}
