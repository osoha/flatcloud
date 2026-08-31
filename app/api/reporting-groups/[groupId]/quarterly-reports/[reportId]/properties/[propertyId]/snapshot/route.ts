import { requireUser } from "@/lib/auth";
import { text } from "@/lib/forms";
import { selectSnapshot } from "@/lib/reporting/quarterly-report-service";
import { quarterlyWorkflowErrorMessage, requireReportInGroup } from "@/lib/reporting/quarterly-workflow-route";
import { goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ groupId: string; reportId: string; propertyId: string }> }) {
  const [{ groupId, reportId, propertyId }, actor] = await Promise.all([params, requireUser()]);
  const workspace = `/reporty/kvartalni/${groupId}/reporty/${reportId}?propertyId=${encodeURIComponent(propertyId)}`;
  try {
    await requireReportInGroup(reportId, groupId);
    const form = await request.formData();
    await selectSnapshot(reportId, propertyId, text(form, "snapshotId", true)!, actor);
    return goWithMessage(request, workspace, "ok", "Snapshot byl vybrán.");
  } catch (error) {
    return goWithMessage(request, workspace, "error", quarterlyWorkflowErrorMessage(error));
  }
}
