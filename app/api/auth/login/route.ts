import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { redirectUrl } from "@/lib/redirect-url";
import {hasTenantPortalAccess} from "@/lib/tenant-portal-access";

export async function POST(request: Request) {
  const form = await request.formData();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  const portal=String(form.get("portal")||"");
  const validPortal=/^[a-zA-Z0-9_-]{8,80}$/.test(portal)?portal:"";
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, active: true, passwordHash: true, sessionVersion: true, role: true } });

  if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) {
    return NextResponse.redirect(redirectUrl(`/login?error=1${validPortal?`&portal=${encodeURIComponent(validPortal)}`:""}`, request), 303);
  }

  await createSession(user.id, user.sessionVersion);
  await prisma.auditLog.create({
    data: { userId: user.id, action: "LOGIN", entityType: "User", entityId: user.id },
  });

  const portalTarget=validPortal&&await hasTenantPortalAccess(user.id,email,validPortal)?`/portal/najemnik/${validPortal}`:null;
  return NextResponse.redirect(redirectUrl(portalTarget|| (user.role === "TENANT" ? "/portal/najemnik" : "/portfolio"), request), 303);
}
