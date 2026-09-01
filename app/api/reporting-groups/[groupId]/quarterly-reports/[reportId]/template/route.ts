import { requireUser } from "@/lib/auth";
import { text } from "@/lib/forms";
import { assignQuarterlyReportDesignTemplate } from "@/lib/reporting/quarterly-report-service";
import { quarterlyWorkflowErrorMessage, requireReportInGroup } from "@/lib/reporting/quarterly-workflow-route";
import { goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ groupId: string; reportId: string }> }) {
  const [{ groupId, reportId }, actor] = await Promise.all([params, requireUser()]);
  const workspace = `/reporty/kvartalni/${groupId}/reporty/${reportId}?section=overview`;
  try {
    await requireReportInGroup(reportId, groupId);
    const form = await request.formData(), action = text(form, "action", true);
    await assignQuarterlyReportDesignTemplate(reportId, action === "use-default" ? null : text(form, "designTemplateVersionId", true)!, actor);
    return goWithMessage(request, workspace, "ok", "Šablona reportu byla uložena.");
  } catch (error) { return goWithMessage(request, workspace, "error", quarterlyWorkflowErrorMessage(error)); }
}
