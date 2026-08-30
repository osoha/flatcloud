import { requireUser } from "@/lib/auth";
import { text } from "@/lib/forms";
import { quarterlyPropertyReportContentSchema } from "@/lib/reporting/editorial-schema";
import { updateQuarterlyPropertyReportContent } from "@/lib/reporting/quarterly-report-service";
import { quarterlyWorkflowErrorMessage, requireReportInGroup } from "@/lib/reporting/quarterly-workflow-route";
import { goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ groupId: string; reportId: string; propertyId: string }> }) {
  const [{ groupId, reportId, propertyId }, actor] = await Promise.all([params, requireUser()]);
  const workspace = `/reporty/kvartalni/${groupId}/reporty/${reportId}`;
  try {
    await requireReportInGroup(reportId, groupId);
    const form = await request.formData();
    const input = quarterlyPropertyReportContentSchema.parse({
      propertyStatus: text(form, "propertyStatus") || null,
      managementCommentary: text(form, "managementCommentary"),
      technicalSections: JSON.parse(text(form, "technicalSections", true)!),
      valuationRows: JSON.parse(text(form, "valuationRows", true)!),
    });
    await updateQuarterlyPropertyReportContent(reportId, propertyId, input, actor);
    return goWithMessage(request, workspace, "ok", "Obsah nemovitosti byl uložen.");
  } catch (error) {
    return goWithMessage(request, workspace, "error", quarterlyWorkflowErrorMessage(error));
  }
}
