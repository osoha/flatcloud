import type { FileAsset } from "@prisma/client";
import { createFileStorage, fileStorageCapabilities } from "../storage";

type ImageAsset = Pick<FileAsset, "storageKey" | "previewStorageKey" | "thumbnailStorageKey" | "originalName" | "mimeType">;

export async function quarterlyReportMediaImageResponse(request: Request, asset: ImageAsset) {
  const requested = new URL(request.url).searchParams.get("variant");
  const variant = requested === "preview" ? "preview" : "thumbnail";
  const derivedKey = variant === "preview" ? asset.previewStorageKey : asset.thumbnailStorageKey;
  const key = derivedKey || asset.previewStorageKey || asset.thumbnailStorageKey || asset.storageKey;
  const contentType = key === asset.storageKey ? asset.mimeType : "image/webp";
  const contentDisposition = `inline; filename*=UTF-8''${encodeURIComponent(asset.originalName)}`;
  const storage = createFileStorage();
  if (fileStorageCapabilities().signedDownloads) return Response.redirect(await storage.getSignedDownloadUrl(key, 300, { contentDisposition, contentType }), 302);
  return new Response(await storage.getObject(key), { headers: { "Cache-Control": "private, no-store", "Content-Type": contentType, "Content-Disposition": contentDisposition } });
}
