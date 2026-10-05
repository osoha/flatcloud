import { actualUser } from "@/lib/auth";
import { PortalConversationError, tenantPortalConversationAttachment } from "@/lib/tenant-portal-conversations";
import { createFileStorage } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ tenantId: string; taskId: string; attachmentId: string }> }) {
  const user = await actualUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { tenantId, taskId, attachmentId } = await params;
  try {
    const attachment = await tenantPortalConversationAttachment(user, tenantId, taskId, attachmentId, new URL(request.url).searchParams.get("preview") === "1");
    if (!attachment) return new Response("Not found", { status: 404 });
    const file = attachment.fileAsset, bytes = await createFileStorage().getObject(file.storageKey);
    return new Response(bytes, { headers: { "Cache-Control": "private, no-store", "Content-Type": file.mimeType, "X-Content-Type-Options": "nosniff", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}` } });
  } catch (error) { return new Response("Not found", { status: error instanceof PortalConversationError ? error.status : 404 }); }
}
