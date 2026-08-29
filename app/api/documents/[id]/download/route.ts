import { currentUser } from "@/lib/auth";
import { requireDocumentAccess } from "@/lib/documents/access";
import { createFileStorage, fileStorageCapabilities } from "@/lib/storage";

export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const document = await requireDocumentAccess(user, (await params).id);
  if (!document || document.deletedAt) return new Response("Not found", { status: 404 });
  const variant = new URL(request.url).searchParams.get("variant") || "original";
  const key = variant === "thumbnail" ? document.fileAsset.thumbnailStorageKey : variant === "preview" ? document.fileAsset.previewStorageKey : document.fileAsset.storageKey;
  if (!key) return new Response("Variant not found", { status: 404 });
  const storage = createFileStorage();
  const headers = { "Cache-Control": "private, no-store", "Content-Type": variant === "original" ? document.fileAsset.mimeType : "image/webp", "Content-Disposition": `${variant === "original" ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(document.fileAsset.originalName)}` };
  if (fileStorageCapabilities().signedDownloads) return Response.redirect(await storage.getSignedDownloadUrl(key, 300, { contentDisposition: headers["Content-Disposition"], contentType: headers["Content-Type"] }), 302);
  const bytes = await storage.getObject(key);
  return new Response(bytes, { headers });
}
