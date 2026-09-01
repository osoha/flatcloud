import { requireUser } from "@/lib/auth";
import { text } from "@/lib/forms";
import { removeQuarterlyPropertySupportivePhoto, selectQuarterlyPropertySupportivePhoto, updateQuarterlyPropertySupportivePhotoCaption } from "@/lib/reporting/quarterly-report-media-service";
import { quarterlyWorkflowErrorMessage, requireReportInGroup } from "@/lib/reporting/quarterly-workflow-route";
import { goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ groupId: string; reportId: string; propertyId: string }> }) {
  const [{ groupId, reportId, propertyId }, actor] = await Promise.all([params, requireUser()]);
  const workspace = `/reporty/kvartalni/${groupId}/reporty/${reportId}?propertyId=${encodeURIComponent(propertyId)}`;
  try {
    await requireReportInGroup(reportId, groupId);
    const form = await request.formData(), action = text(form, "action", true);
    if (action === "remove") await removeQuarterlyPropertySupportivePhoto({ reportId, reportingGroupId: groupId, propertyId }, actor);
    else if (action === "select") await selectQuarterlyPropertySupportivePhoto({ reportId, reportingGroupId: groupId, propertyId, sourceDocumentId: text(form, "sourceDocumentId", true)!, caption: text(form, "caption") }, actor);
    else if (action === "update-caption") await updateQuarterlyPropertySupportivePhotoCaption({ reportId, reportingGroupId: groupId, propertyId, caption: text(form, "caption") }, actor);
    else throw new Error("Unknown report media action.");
    return goWithMessage(request, workspace, "ok", action === "remove" ? "Doplňková fotografie byla odebrána." : "Doplňková fotografie byla uložena.");
  } catch (error) { return goWithMessage(request, workspace, "error", quarterlyWorkflowErrorMessage(error)); }
}
