import { currentUser } from "@/lib/auth";
import { quarterlyReportMediaImageResponse } from "@/lib/reporting/quarterly-report-media-image";
import { resolveQuarterlyPropertyCandidateImage } from "@/lib/reporting/quarterly-report-media-service";

export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ groupId: string; reportId: string; propertyId: string; documentId: string }> }) {
  const actor = await currentUser();
  if (!actor) return new Response("Unauthorized", { status: 401 });
  try {
    const { groupId, reportId, propertyId, documentId } = await params;
    const asset = await resolveQuarterlyPropertyCandidateImage({ reportId, reportingGroupId: groupId, propertyId, documentId }, actor);
    return quarterlyReportMediaImageResponse(request, asset);
  } catch {
    return new Response("Property photo was not found.", { status: 404 });
  }
}
