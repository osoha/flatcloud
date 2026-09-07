import { currentUser } from "@/lib/auth";
import { AnnualReportAssetError, generatePublishedAnnualReportAsset } from "@/lib/reporting/annual-report-asset-service";
import { goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ groupId: string; reportId: string }> }) {
  const actor = await currentUser();
  if (!actor) return new Response("Unauthorized", { status: 401 });
  const { groupId, reportId } = await params;
  const workspace = `/reporty/vyrocni/${groupId}/reporty/${reportId}?section=review`;
  try {
    await generatePublishedAnnualReportAsset(reportId, groupId, actor);
    return goWithMessage(request, workspace, "ok", "Publikovaný výroční PDF soubor byl vygenerován.");
  } catch (error) {
    if (error instanceof AnnualReportAssetError) return new Response(error.message, { status: error.status });
    console.error("Annual report asset generation failed.", error);
    return new Response("Annual report asset generation failed.", { status: 500 });
  }
}
