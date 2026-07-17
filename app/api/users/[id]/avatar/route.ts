import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { normalizeAvatarBytes } from "@/lib/avatar";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await currentUser();
  if (!viewer) return new Response(null, { status: 401 });
  const { id } = await params;
  const user = await prisma.user.findUnique({ where: { id }, select: { avatarData: true, avatarMimeType: true, updatedAt: true } });
  if (!user?.avatarData || !user.avatarMimeType) return new Response(null, { status: 404 });

  try {
    const normalized = await normalizeAvatarBytes(new Uint8Array(user.avatarData));
    return new Response(new Uint8Array(normalized), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, max-age=86400, immutable",
        "Last-Modified": user.updatedAt.toUTCString(),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response(new Uint8Array(user.avatarData), {
      headers: {
        "Content-Type": user.avatarMimeType,
        "Cache-Control": "private, max-age=3600",
        "Last-Modified": user.updatedAt.toUTCString(),
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
}
