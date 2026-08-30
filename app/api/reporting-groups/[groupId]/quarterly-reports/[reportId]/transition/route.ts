import { requireUser } from "@/lib/auth";
import { text } from "@/lib/forms";
import {
  acknowledgeQuarterlyReportWarnings,
  createCorrectionRevision,
  publishQuarterlyReport,
  returnQuarterlyReportToDraft,
  submitQuarterlyReportForReview,
} from "@/lib/reporting/quarterly-report-service";
import {
  QuarterlyWorkflowRouteError,
  quarterlyWorkflowErrorMessage,
  requireReportInGroup,
} from "@/lib/reporting/quarterly-workflow-route";
import { goWithMessage } from "@/lib/route-response";

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ groupId: string; reportId: string }>;
  },
) {
  const [{ groupId, reportId }, actor] = await Promise.all([
    params,
    requireUser(),
  ]);

  const workspace =
    `/reporty/kvartalni/${groupId}/reporty/${reportId}`;

  try {
    await requireReportInGroup(reportId, groupId);

    const action = text(await request.formData(), "action", true);

    let target = workspace;
    let message = "";

    if (action === "submit-review") {
      await submitQuarterlyReportForReview(reportId, actor);
      message = "Report byl odeslán ke kontrole.";
    } else if (action === "return-draft") {
      await returnQuarterlyReportToDraft(reportId, actor);
      message = "Report byl vrácen do konceptu.";
    } else if (action === "acknowledge-warnings") {
      await acknowledgeQuarterlyReportWarnings(reportId, actor);
      message =
        "Warningy kvality dat byly potvrzeny pro tento kontrolní cyklus.";
    } else if (action === "publish") {
      await publishQuarterlyReport(reportId, actor);
      message = "Report byl publikován.";
    } else if (action === "create-correction") {
      const correction = await createCorrectionRevision(reportId, actor);
      target =
        `/reporty/kvartalni/${groupId}/reporty/${correction.id}`;
      message = `Byla založena opravná revize ${correction.revision}.`;
    } else {
      throw new QuarterlyWorkflowRouteError(
        "Neplatná změna stavu reportu.",
      );
    }

    return goWithMessage(request, target, "ok", message);
  } catch (error) {
    return goWithMessage(
      request,
      workspace,
      "error",
      quarterlyWorkflowErrorMessage(error),
    );
  }
}
