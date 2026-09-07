import { currentUser } from "@/lib/auth";
import { AnnualReportAssetError, getPublishedAnnualReportAssetForDownload } from "@/lib/reporting/annual-report-asset-service";
import { createFileStorage, fileStorageCapabilities } from "@/lib/storage";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ groupId: string; reportId: string }> }) {
  const actor = await currentUser();
  if (!actor) return new Response("Unauthorized", { status: 401 });
  const { groupId, reportId } = await params;
  try {
    const asset = await getPublishedAnnualReportAssetForDownload(reportId, groupId, actor);
    const storage = createFileStorage();
    const contentDisposition = `attachment; filename*=UTF-8''${encodeURIComponent(asset.originalName)}`;
    if (fileStorageCapabilities().signedDownloads) return Response.redirect(await storage.getSignedDownloadUrl(asset.storageKey, 300, { contentDisposition, contentType: asset.mimeType }), 302);
    return new Response(await storage.getObject(asset.storageKey), { headers: { "Cache-Control": "private, no-store", "Content-Type": asset.mimeType, "Content-Disposition": contentDisposition } });
  } catch (error) {
    if (error instanceof AnnualReportAssetError) return new Response(error.message, { status: error.status });
    console.error("Published annual report asset download failed.", error);
    return new Response("Published annual report asset download failed.", { status: 500 });
  }
}
