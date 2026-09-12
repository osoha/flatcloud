import { requireUser } from "@/lib/auth";
import { text } from "@/lib/forms";
import {
  approveAnnualReportPreview,
  createAnnualCorrectionRevision,
  publishAnnualReport,
  requireAnnualReportInGroup,
  returnAnnualReportToDraft,
  submitAnnualReportForReview,
} from "@/lib/reporting/annual-report-service";
import { annualWorkflowErrorMessage } from "@/lib/reporting/annual-workflow-route";
import { goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ groupId: string; reportId: string }> }) {
  const [{ groupId, reportId }, actor] = await Promise.all([params, requireUser()]);
  const workspace = `/reporty/vyrocni/${groupId}/reporty/${reportId}?section=review`;
  try {
    await requireAnnualReportInGroup(reportId, groupId);
    const action = text(await request.formData(), "action", true);
    let target = workspace;
    let message = "";
    if (action === "submit-review") {
      await submitAnnualReportForReview(reportId, actor);
      message = "Výroční report byl odeslán ke kontrole.";
    } else if (action === "return-draft") {
      await returnAnnualReportToDraft(reportId, actor);
      message = "Výroční report byl vrácen do konceptu.";
    } else if (action === "approve-preview") {
      await approveAnnualReportPreview(reportId, actor);
      message = "Kontrola PDF náhledu byla potvrzena.";
    } else if (action === "publish") {
      await publishAnnualReport(reportId, actor);
      message = "Výroční report byl interně publikován.";
    } else if (action === "create-correction") {
      const correction = await createAnnualCorrectionRevision(reportId, actor);
      target = `/reporty/vyrocni/${groupId}/reporty/${correction.id}`;
      message = `Byla založena opravná revize ${correction.revision}.`;
    } else {
      throw new Error("Invalid annual report transition.");
    }
    return goWithMessage(request, target, "ok", message);
  } catch (error) {
    return goWithMessage(request, workspace, "error", annualWorkflowErrorMessage(error));
  }
}
