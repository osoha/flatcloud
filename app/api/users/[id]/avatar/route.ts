import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await currentUser();
  if (!viewer) return new Response(null, { status: 401 });
  const { id } = await params;
  const user = await prisma.user.findUnique({ where: { id }, select: { avatarData: true, avatarMimeType: true, updatedAt: true } });
  if (!user?.avatarData || !user.avatarMimeType) return new Response(null, { status: 404 });
  return new Response(Buffer.from(user.avatarData), {
    headers: {
      "Content-Type": user.avatarMimeType,
      "Cache-Control": "private, max-age=86400, immutable",
      "Last-Modified": user.updatedAt.toUTCString(),
      "X-Content-Type-Options": "nosniff",
    },
  });
}
