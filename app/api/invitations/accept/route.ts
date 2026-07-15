import bcrypt from "bcryptjs";
import { PropertyPermission } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hashInvitationToken } from "@/lib/invitations";
import { createSession } from "@/lib/auth";
import { go, goWithMessage } from "@/lib/route-response";

const rank: Record<PropertyPermission, number> = { VIEW: 1, EDIT: 2, ADMIN: 3 };

export async function POST(request: Request) {
  let token = "";
  try {
    const form = await request.formData();
    token = String(form.get("token") || "");
    const name = String(form.get("name") || "").trim();
    const password = String(form.get("password") || "");
    const invitation = await prisma.userInvitation.findUnique({ where: { tokenHash: hashInvitationToken(token) }, include: { property: true } });
    if (!invitation || invitation.status !== "PENDING") throw new Error("Pozvánka není platná nebo už byla použita.");
    if (invitation.expiresAt.getTime() < Date.now()) {
      await prisma.userInvitation.update({ where: { id: invitation.id }, data: { status: "EXPIRED" } });
      throw new Error("Platnost pozvánky vypršela.");
    }
    let user = await prisma.user.findUnique({ where: { email: invitation.email } });
    if (user) {
      if (!user.active || !(await bcrypt.compare(password, user.passwordHash))) throw new Error("Pro existující účet zadejte správné heslo.");
    } else {
      if (!name) throw new Error("Zadejte jméno.");
      if (password.length < 12) throw new Error("Heslo musí mít alespoň 12 znaků.");
      user = await prisma.user.create({ data: { email: invitation.email, name, passwordHash: await bcrypt.hash(password, 12), role: "OWNER_VIEWER" } });
    }
    const current = await prisma.userProperty.findUnique({ where: { userId_propertyId: { userId: user.id, propertyId: invitation.propertyId } } });
    const permission = current && rank[current.permission] > rank[invitation.permission] ? current.permission : invitation.permission;
    await prisma.$transaction([
      prisma.userProperty.upsert({ where: { userId_propertyId: { userId: user.id, propertyId: invitation.propertyId } }, update: { permission }, create: { userId: user.id, propertyId: invitation.propertyId, permission } }),
      prisma.userInvitation.update({ where: { id: invitation.id }, data: { status: "ACCEPTED", acceptedAt: new Date() } }),
      prisma.auditLog.create({ data: { userId: user.id, action: "INVITATION_ACCEPTED", entityType: "UserInvitation", entityId: invitation.id, details: { propertyId: invitation.propertyId, permission } } }),
    ]);
    await createSession(user.id);
    return goWithMessage(request, `/nemovitosti/${invitation.propertyId}/prehled`, "ok", `Pozvánka k nemovitosti ${invitation.property.name} byla přijata.`);
  } catch (error) {
    return goWithMessage(request, `/pozvanka/${encodeURIComponent(token)}`, "error", error instanceof Error ? error.message : "Pozvánku se nepodařilo přijmout.");
  }
}
