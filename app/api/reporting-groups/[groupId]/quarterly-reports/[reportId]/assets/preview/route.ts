import { currentUser } from "@/lib/auth";
import { renderPublishedReportPdfPreview, ReportAssetError } from "@/lib/reporting/report-asset-service";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ groupId: string; reportId: string }> }) {
  const actor = await currentUser();
  if (!actor) return new Response("Unauthorized", { status: 401 });
  const { groupId, reportId } = await params;
  try {
    const preview = await renderPublishedReportPdfPreview(reportId, groupId, actor);
    return new Response(preview.bytes, { headers: { "Cache-Control": "private, no-store", "Content-Type": preview.mimeType, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(preview.originalName)}` } });
  } catch (error) {
    if (error instanceof ReportAssetError) return new Response(error.message, { status: error.status });
    console.error("Published report PDF preview failed.", error);
    return new Response("Published report PDF preview failed.", { status: 500 });
  }
}
