import { guideOriginMatches } from "@/lib/guide-origin";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { currentUser, createSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirectUrl } from "@/lib/redirect-url";

export async function POST(request: Request) {
  if (!guideOriginMatches(request))
    return new Response("Forbidden", { status: 403 });
  const user = await currentUser();
  if (!user) return NextResponse.redirect(redirectUrl("/login", request), 303);

  const accountPath =
    user.role === "TENANT" ? "/portal/najemnik/ucet" : "/ucet";
  const form = await request.formData();
  const currentPassword = String(form.get("currentPassword") || "");
  const newPassword = String(form.get("newPassword") || "");
  const confirmPassword = String(form.get("confirmPassword") || "");

  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return NextResponse.redirect(redirectUrl(`${accountPath}?error=current`, request), 303);
  }
  if (newPassword.length < 12 || newPassword.length > 200) {
    return NextResponse.redirect(redirectUrl(`${accountPath}?error=length`, request), 303);
  }
  if (newPassword !== confirmPassword) {
    return NextResponse.redirect(redirectUrl(`${accountPath}?error=match`, request), 303);
  }
  if (await bcrypt.compare(newPassword, user.passwordHash)) {
    return NextResponse.redirect(
      redirectUrl(`${accountPath}?error=same`, request),
      303,
    );
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  const changed = await prisma.$transaction(async tx => {
    const result = await tx.user.updateMany({ where: { id: user.id, active: true, passwordHash: user.passwordHash, sessionVersion: user.sessionVersion }, data: { passwordHash, sessionVersion: { increment: 1 } } });
    if (result.count !== 1) return false;
    await tx.auditLog.create({ data: { userId: user.id, action: "PASSWORD_CHANGED", entityType: "User", entityId: user.id } });
    return true;
  });
  if (!changed) return NextResponse.redirect(redirectUrl("/login", request), 303);
  await createSession(user.id, user.sessionVersion + 1);

  return NextResponse.redirect(
    redirectUrl(`${accountPath}?changed=1`, request),
    303,
  );
}
