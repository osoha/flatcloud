import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { requirePropertyAccess, requireUnitAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return new NextResponse(null, { status: 401 });
  const key = new URL(request.url).searchParams.get("key") || "";
  const [kind, id] = key.split(":");
  if (!id || !["unit", "property"].includes(kind)) return new NextResponse(null, { status: 404 });
  const accessible = kind === "property" ? await requirePropertyAccess(user, id) : await prisma.unit.findUnique({ where: { id }, select: { propertyId: true } }).then(unit => unit && requireUnitAccess(user, unit.propertyId, id));
  if (!accessible) return new NextResponse(null, { status: 404 });
  const appearance = await prisma.userEntityAppearance.findUnique({ where: { userId_entityKey: { userId: user.id, entityKey: key } } });
  if (appearance?.photoId !== "upload" || !appearance.avatarData || !appearance.avatarMimeType) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(appearance.avatarData), { headers: { "Content-Type": appearance.avatarMimeType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
