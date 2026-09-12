import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { passwordResetError } from "@/lib/password-reset-policy";
import { redirectUrl } from "@/lib/redirect-url";
import { goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // Require the canonical browser origin, including behind Render's internal proxy URL.
  if (request.headers.get("origin") !== redirectUrl("/", request).origin) return new NextResponse(null, { status: 403 });
  const admin = await currentUser();
  if (!admin || admin.role !== "SUPER_ADMIN") return new NextResponse(null, { status: 403 });
  const { id } = await params;
  const destination = `/uzivatele/${encodeURIComponent(id)}/obnova-hesla`;
  const fail = (message: string) => goWithMessage(request, destination, "error", message);
  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, active: true, role: true, passwordHash: true, sessionVersion: true } });
  if (!target) return new NextResponse(null, { status: 404 });
  try {
    const form = await request.formData();
    const password = String(form.get("newPassword") || "");
    const reason = String(form.get("reason") || "").trim();
    const error = passwordResetError({ actorId: admin.id, targetId: id, targetActive: target.active, targetRole: target.role, password, confirmation: String(form.get("confirmPassword") || ""), confirmed: form.get("confirmReset") === "on", reason });
    if (error) return fail(error);
    const adminPassword = String(form.get("adminPassword") || "");
    if (Buffer.byteLength(adminPassword, "utf8") > 72 || !(await bcrypt.compare(adminPassword, admin.passwordHash))) return fail("Heslo hlavního administrátora není správné.");
    if (await bcrypt.compare(password, target.passwordHash)) return fail("Nové heslo musí být odlišné od současného.");
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.$transaction(async tx => {
      const actor = await tx.user.findUnique({ where: { id: admin.id }, select: { active: true, role: true, passwordHash: true, sessionVersion: true } });
      if (!actor?.active || actor.role !== "SUPER_ADMIN" || actor.passwordHash !== admin.passwordHash || actor.sessionVersion !== admin.sessionVersion) throw new Error("stale actor");
      const changed = await tx.user.updateMany({ where: { id, active: true, role: { not: "SUPER_ADMIN" }, passwordHash: target.passwordHash, sessionVersion: target.sessionVersion }, data: { passwordHash, sessionVersion: { increment: 1 } } });
      if (changed.count !== 1) throw new Error("stale target");
      await tx.auditLog.create({ data: { userId: admin.id, action: "USER_PASSWORD_RESET", entityType: "User", entityId: id, details: { reason, sessionsRevoked: true } } });
    }, { isolationLevel: "Serializable" });
    return goWithMessage(request, `/uzivatele/${encodeURIComponent(id)}`, "ok", "Heslo bylo obnoveno a dosavadní přihlášení uživatele zneplatněna. Role a oprávnění zůstaly zachované.");
  } catch {
    return fail("Heslo se nepodařilo obnovit. Obnovte stránku a zkontrolujte aktuální stav účtu.");
  }
}
