import { requireUser } from "@/lib/auth";
import { text } from "@/lib/forms";
import { quarterlyReportEditorialSchema } from "@/lib/reporting/editorial-schema";
import { updateQuarterlyReportEditorial } from "@/lib/reporting/quarterly-report-service";
import { quarterlyWorkflowErrorMessage, requireReportInGroup } from "@/lib/reporting/quarterly-workflow-route";
import { goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ groupId: string; reportId: string }> }) {
  const [{ groupId, reportId }, actor] = await Promise.all([params, requireUser()]);
  const workspace = `/reporty/kvartalni/${groupId}/reporty/${reportId}`;
  try {
    await requireReportInGroup(reportId, groupId);
    const form = await request.formData();
    const input = quarterlyReportEditorialSchema.parse({ executiveSummary: text(form, "executiveSummary") });
    await updateQuarterlyReportEditorial(reportId, input, actor);
    return goWithMessage(request, workspace, "ok", "Shrnutí reportu bylo uloženo.");
  } catch (error) {
    return goWithMessage(request, workspace, "error", quarterlyWorkflowErrorMessage(error));
  }
}
