import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Přihlášení vypršelo." }, { status: 401 });
  const now = new Date();
  // One row per actual account; caller-supplied identity/timestamps are never accepted.
  await prisma.userActivity.upsert({ where: { userId: user.id }, create: { userId: user.id, lastSeenAt: now }, update: {} });
  await prisma.userActivity.updateMany({ where: { userId: user.id, lastSeenAt: { lt: new Date(now.getTime() - 45_000) } }, data: { lastSeenAt: now } });
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
