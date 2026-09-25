import { requireUser } from "@/lib/auth";
import { tenantAccessWhere } from "@/lib/access";
import { prisma } from "@/lib/db";

export async function GET(_request: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  const user = await requireUser();
  const { tenantId } = await params;
  const tenant = await prisma.tenant.findFirst({ where: { id: tenantId, ...tenantAccessWhere(user) }, select: { avatarData: true, avatarMimeType: true } });
  if (!tenant?.avatarData || !tenant.avatarMimeType) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(tenant.avatarData), { headers: { "Content-Type": tenant.avatarMimeType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
