import { requireUser } from "@/lib/auth";
import { text } from "@/lib/forms";
import { removeQuarterlyPropertyPrimaryPhoto, selectQuarterlyPropertyPrimaryPhoto, updateQuarterlyPropertyPrimaryPhotoCaption } from "@/lib/reporting/quarterly-report-media-service";
import { quarterlyWorkflowErrorMessage, requireReportInGroup } from "@/lib/reporting/quarterly-workflow-route";
import { goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ groupId: string; reportId: string; propertyId: string }> }) {
  const [{ groupId, reportId, propertyId }, actor] = await Promise.all([params, requireUser()]);
  const workspace = `/reporty/kvartalni/${groupId}/reporty/${reportId}?propertyId=${encodeURIComponent(propertyId)}`;
  try {
    await requireReportInGroup(reportId, groupId);
    const form = await request.formData();
    const action = text(form, "action", true);
    if (action === "remove") await removeQuarterlyPropertyPrimaryPhoto({ reportId, reportingGroupId: groupId, propertyId }, actor);
    else if (action === "select") await selectQuarterlyPropertyPrimaryPhoto({ reportId, reportingGroupId: groupId, propertyId, sourceDocumentId: text(form, "sourceDocumentId", true)!, caption: text(form, "caption") }, actor);
    else if (action === "update-caption") await updateQuarterlyPropertyPrimaryPhotoCaption({ reportId, reportingGroupId: groupId, propertyId, caption: text(form, "caption") }, actor);
    else throw new Error("Unknown report media action.");
    return goWithMessage(request, workspace, "ok", action === "remove" ? "Primární fotografie byla odebrána." : "Primární fotografie byla uložena.");
  } catch (error) {
    return goWithMessage(request, workspace, "error", quarterlyWorkflowErrorMessage(error));
  }
}
