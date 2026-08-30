import { requireUser } from "@/lib/auth";
import { text } from "@/lib/forms";
import { returnQuarterlyReportToDraft, submitQuarterlyReportForReview } from "@/lib/reporting/quarterly-report-service";
import { QuarterlyWorkflowRouteError, quarterlyWorkflowErrorMessage, requireReportInGroup } from "@/lib/reporting/quarterly-workflow-route";
import { goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ groupId: string; reportId: string }> }) {
  const [{ groupId, reportId }, actor] = await Promise.all([params, requireUser()]);
  const workspace = `/reporty/kvartalni/${groupId}/reporty/${reportId}`;
  try {
    await requireReportInGroup(reportId, groupId);
    const action = text(await request.formData(), "action", true);
    if (action === "submit-review") await submitQuarterlyReportForReview(reportId, actor);
    else if (action === "return-draft") await returnQuarterlyReportToDraft(reportId, actor);
    else throw new QuarterlyWorkflowRouteError("Neplatná změna stavu reportu.");
    return goWithMessage(request, workspace, "ok", action === "submit-review" ? "Report byl odeslán ke kontrole." : "Report byl vrácen do konceptu.");
  } catch (error) {
    return goWithMessage(request, workspace, "error", quarterlyWorkflowErrorMessage(error));
  }
}
