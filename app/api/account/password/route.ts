import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url), 303);

  const form = await request.formData();
  const currentPassword = String(form.get("currentPassword") || "");
  const newPassword = String(form.get("newPassword") || "");
  const confirmPassword = String(form.get("confirmPassword") || "");

  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return NextResponse.redirect(new URL("/ucet?error=current", request.url), 303);
  }
  if (newPassword.length < 12) {
    return NextResponse.redirect(new URL("/ucet?error=length", request.url), 303);
  }
  if (newPassword !== confirmPassword) {
    return NextResponse.redirect(new URL("/ucet?error=match", request.url), 303);
  }
  if (await bcrypt.compare(newPassword, user.passwordHash)) {
    return NextResponse.redirect(new URL("/ucet?error=same", request.url), 303);
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.auditLog.create({
      data: { userId: user.id, action: "PASSWORD_CHANGED", entityType: "User", entityId: user.id },
    }),
  ]);

  return NextResponse.redirect(new URL("/ucet?changed=1", request.url), 303);
}
