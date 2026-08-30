import { currentUser } from "@/lib/auth";
import { generatePublishedReportAsset, ReportAssetError } from "@/lib/reporting/report-asset-service";
import { goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ groupId: string; reportId: string }> }) {
  const actor = await currentUser();
  if (!actor) return new Response("Unauthorized", { status: 401 });
  const { groupId, reportId } = await params;
  const workspace = `/reporty/kvartalni/${groupId}/reporty/${reportId}`;
  try {
    await generatePublishedReportAsset(reportId, groupId, actor);
    return goWithMessage(request, workspace, "ok", "Publikovaný soubor byl vygenerován.");
  } catch (error) {
    if (error instanceof ReportAssetError) return new Response(error.message, { status: error.status });
    console.error("Published report asset generation failed.", error);
    return new Response("Published report asset generation failed.", { status: 500 });
  }
}
