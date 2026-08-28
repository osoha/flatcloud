import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { hashInvitationToken } from "@/lib/invitations";
import { createSession } from "@/lib/auth";
import { goWithMessage } from "@/lib/route-response";
import { strongerPermission, strongerRole } from "@/lib/user-access-management";

export async function POST(request: Request) {
  let token = "";
  try {
    const form = await request.formData();
    token = String(form.get("token") || "");
    const submittedName = String(form.get("name") || "").trim();
    const password = String(form.get("password") || "");
    const invitation = await prisma.userInvitation.findUnique({ where: { tokenHash: hashInvitationToken(token) }, include: { property: true } });
    if (!invitation || invitation.status !== "PENDING") throw new Error("Pozvánka není platná nebo už byla použita.");
    if (invitation.expiresAt.getTime() < Date.now()) { await prisma.userInvitation.update({ where: { id: invitation.id }, data: { status: "EXPIRED" } }); throw new Error("Platnost pozvánky vypršela."); }
    const invitedName = invitation.name?.trim() || submittedName;
    let user = await prisma.user.findUnique({ where: { email: invitation.email }, select: { id: true, name: true, email: true, active: true, passwordHash: true, role: true } });
    if (user) {
      if (!user.active || !(await bcrypt.compare(password, user.passwordHash))) throw new Error("Pro existující účet zadejte správné heslo.");
      user = await prisma.user.update({ where: { id: user.id }, data: { ...(invitation.name && user.name !== invitation.name ? { name: invitation.name } : {}), role: strongerRole(user.role, invitation.role) }, select: { id: true, name: true, email: true, active: true, passwordHash: true, role: true } });
    } else {
      if (!invitedName) throw new Error("Zadejte jméno.");
      if (password.length < 12) throw new Error("Heslo musí mít alespoň 12 znaků.");
      user = await prisma.user.create({ data: { email: invitation.email, name: invitedName, passwordHash: await bcrypt.hash(password, 12), role: invitation.role, allProperties: invitation.allProperties }, select: { id: true, name: true, email: true, active: true, passwordHash: true, role: true } });
    }
    const propertyIds = invitation.allProperties ? [] : invitation.propertyIds.length ? invitation.propertyIds : invitation.unitIds.length ? [] : [invitation.propertyId];
    const unitIds = invitation.allProperties ? [] : invitation.unitIds;
    await prisma.$transaction(async (tx) => {
      if (invitation.allProperties) await tx.user.update({ where: { id: user!.id }, data: { allProperties: true } });
      for (const propertyId of propertyIds) { const current = await tx.userProperty.findUnique({ where: { userId_propertyId: { userId: user!.id, propertyId } } }); await tx.userProperty.upsert({ where: { userId_propertyId: { userId: user!.id, propertyId } }, update: { permission: current ? strongerPermission(current.permission, invitation.permission) : invitation.permission }, create: { userId: user!.id, propertyId, permission: invitation.permission } }); }
      for (const unitId of unitIds) { const current = await tx.userUnit.findUnique({ where: { userId_unitId: { userId: user!.id, unitId } } }); await tx.userUnit.upsert({ where: { userId_unitId: { userId: user!.id, unitId } }, update: { permission: current ? strongerPermission(current.permission, invitation.permission) : invitation.permission }, create: { userId: user!.id, unitId, permission: invitation.permission } }); }
      await tx.userInvitation.update({ where: { id: invitation.id }, data: { status: "ACCEPTED", acceptedAt: new Date() } });
      await tx.auditLog.create({ data: { userId: user!.id, action: "INVITATION_ACCEPTED", entityType: "UserInvitation", entityId: invitation.id, details: { propertyIds, unitIds, allProperties: invitation.allProperties, permission: invitation.permission, role: invitation.role } } });
    });
    await createSession(user.id);
    const firstUnit = unitIds.length ? await prisma.unit.findUnique({ where: { id: unitIds[0] }, select: { propertyId: true } }) : null;
    return goWithMessage(request, invitation.allProperties ? "/portfolio" : `/nemovitosti/${propertyIds[0] || firstUnit?.propertyId}/prehled`, "ok", "Pozvánka byla přijata.");
  } catch (error) { return goWithMessage(request, `/pozvanka/${encodeURIComponent(token)}`, "error", error instanceof Error ? error.message : "Pozvánku se nepodařilo přijmout."); }
}
