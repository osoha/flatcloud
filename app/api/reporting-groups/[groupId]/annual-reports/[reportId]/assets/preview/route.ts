import { currentUser } from "@/lib/auth";
import { AnnualReportAssetError, renderAnnualReportPdfPreview } from "@/lib/reporting/annual-report-asset-service";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ groupId: string; reportId: string }> }) {
  const actor = await currentUser();
  if (!actor) return new Response("Unauthorized", { status: 401 });
  const { groupId, reportId } = await params;
  try {
    const preview = await renderAnnualReportPdfPreview(reportId, groupId, actor);
    return new Response(preview.bytes, { headers: { "Cache-Control": "private, no-store", "Content-Type": preview.mimeType, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(preview.originalName)}` } });
  } catch (error) {
    if (error instanceof AnnualReportAssetError) return new Response(error.message, { status: error.status });
    console.error("Annual report PDF preview failed.", error);
    return new Response("Annual report PDF preview failed.", { status: 500 });
  }
}
