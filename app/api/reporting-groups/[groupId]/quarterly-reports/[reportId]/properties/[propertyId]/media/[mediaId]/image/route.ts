import { currentUser } from "@/lib/auth";
import { quarterlyReportMediaImageResponse } from "@/lib/reporting/quarterly-report-media-image";
import { resolveQuarterlyPropertyReportMediaImage } from "@/lib/reporting/quarterly-report-media-service";

export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ groupId: string; reportId: string; propertyId: string; mediaId: string }> }) {
  const actor = await currentUser();
  if (!actor) return new Response("Unauthorized", { status: 401 });
  try {
    const { groupId, reportId, propertyId, mediaId } = await params;
    const asset = await resolveQuarterlyPropertyReportMediaImage({ reportId, reportingGroupId: groupId, propertyId, mediaId }, actor);
    return quarterlyReportMediaImageResponse(request, asset);
  } catch {
    return new Response("Report photo was not found.", { status: 404 });
  }
}
