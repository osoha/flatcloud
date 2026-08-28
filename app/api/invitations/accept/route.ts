import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { hashInvitationToken } from "@/lib/invitations";
import { createSession } from "@/lib/auth";
import { goWithMessage } from "@/lib/route-response";
import { canonicalizeAccessScope, strongerPermission, strongerRole } from "@/lib/user-access-management";

export async function POST(request: Request) {
  let token = "";
  try {
    const form = await request.formData();
    token = String(form.get("token") || "");
    const tokenHash = hashInvitationToken(token);
    const submittedName = String(form.get("name") || "").trim();
    const password = String(form.get("password") || "");
    const invitation = await prisma.userInvitation.findUnique({ where: { tokenHash } });
    if (!invitation || invitation.status !== "PENDING") throw new Error("Pozvánka není platná nebo už byla použita.");
    if (invitation.expiresAt.getTime() < Date.now()) { await prisma.userInvitation.updateMany({ where: { id: invitation.id, status: "PENDING" }, data: { status: "EXPIRED" } }); throw new Error("Platnost pozvánky vypršela."); }
    const existing = await prisma.user.findUnique({ where: { email: invitation.email }, select: { id: true, active: true, passwordHash: true } });
    if (existing && (!existing.active || !(await bcrypt.compare(password, existing.passwordHash)))) throw new Error("Pro existující účet zadejte správné heslo.");
    const invitedName = invitation.name?.trim() || submittedName;
    if (!existing && !invitedName) throw new Error("Zadejte jméno.");
    if (!existing && password.length < 12) throw new Error("Heslo musí mít alespoň 12 znaků.");
    const newPasswordHash = existing ? null : await bcrypt.hash(password, 12);

    const accepted = await prisma.$transaction(async (tx) => {
      const currentInvitation = await tx.userInvitation.findUnique({ where: { tokenHash } });
      if (!currentInvitation || currentInvitation.status !== "PENDING" || currentInvitation.expiresAt.getTime() < Date.now()) throw new Error("Pozvánka už byla změněna, zrušena nebo vypršela.");
      const scope = canonicalizeAccessScope({ role: currentInvitation.role, permission: currentInvitation.permission, allProperties: currentInvitation.allProperties, propertyIds: currentInvitation.propertyIds.length ? currentInvitation.propertyIds : currentInvitation.unitIds.length ? [] : [currentInvitation.propertyId], unitIds: currentInvitation.unitIds });
      let user;
      if (existing) {
        const currentUser = await tx.user.findUnique({ where: { id: existing.id }, select: { id: true, role: true, allProperties: true, active: true } });
        if (!currentUser?.active) throw new Error("Uživatel je deaktivovaný. Nejprve účet znovu aktivujte.");
        user = await tx.user.update({ where: { id: currentUser.id }, data: { ...(currentInvitation.name ? { name: currentInvitation.name } : {}), role: strongerRole(currentUser.role, scope.role), allProperties: currentUser.allProperties || scope.allProperties }, select: { id: true } });
      } else {
        if (await tx.user.findUnique({ where: { email: currentInvitation.email }, select: { id: true } })) throw new Error("Účet byl mezitím vytvořen. Přihlaste se a přijměte pozvánku znovu.");
        user = await tx.user.create({ data: { email: currentInvitation.email, name: invitedName, passwordHash: newPasswordHash!, role: scope.role, allProperties: scope.allProperties }, select: { id: true } });
      }
      if (!scope.allProperties) for (const propertyId of scope.propertyIds) {
        const current = await tx.userProperty.findUnique({ where: { userId_propertyId: { userId: user.id, propertyId } } });
        await tx.userProperty.upsert({ where: { userId_propertyId: { userId: user.id, propertyId } }, update: { permission: current ? strongerPermission(current.permission, scope.permission) : scope.permission }, create: { userId: user.id, propertyId, permission: scope.permission } });
      }
      if (!scope.allProperties) for (const unitId of scope.unitIds) {
        const current = await tx.userUnit.findUnique({ where: { userId_unitId: { userId: user.id, unitId } } });
        await tx.userUnit.upsert({ where: { userId_unitId: { userId: user.id, unitId } }, update: { permission: current ? strongerPermission(current.permission, scope.permission) : scope.permission }, create: { userId: user.id, unitId, permission: scope.permission } });
      }
      const claimed = await tx.userInvitation.updateMany({ where: { id: currentInvitation.id, status: "PENDING" }, data: { status: "ACCEPTED", acceptedAt: new Date() } });
      if (claimed.count !== 1) throw new Error("Pozvánka už byla přijata nebo změněna.");
      await tx.auditLog.create({ data: { userId: user.id, action: "INVITATION_ACCEPTED", entityType: "UserInvitation", entityId: currentInvitation.id, details: scope } });
      const firstUnit = scope.unitIds.length ? await tx.unit.findUnique({ where: { id: scope.unitIds[0] }, select: { propertyId: true } }) : null;
      return { userId: user.id, allProperties: scope.allProperties, propertyId: scope.propertyIds[0] || firstUnit?.propertyId };
    });
    await createSession(accepted.userId);
    return goWithMessage(request, accepted.allProperties ? "/portfolio" : `/nemovitosti/${accepted.propertyId}/prehled`, "ok", "Pozvánka byla přijata.");
  } catch (error) { return goWithMessage(request, `/pozvanka/${encodeURIComponent(token)}`, "error", error instanceof Error ? error.message : "Pozvánku se nepodařilo přijmout."); }
}
