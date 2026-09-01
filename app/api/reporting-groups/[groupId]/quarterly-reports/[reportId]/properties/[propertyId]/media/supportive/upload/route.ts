import { requireUser } from "@/lib/auth";
import { prepareDocumentFiles } from "@/lib/documents/upload";
import { text } from "@/lib/forms";
import { uploadQuarterlyPropertySupportivePhoto } from "@/lib/reporting/quarterly-report-media-service";
import { quarterlyWorkflowErrorMessage, requireReportInGroup } from "@/lib/reporting/quarterly-workflow-route";
import { goWithMessage } from "@/lib/route-response";
import { fileStorageCapabilities } from "@/lib/storage";

export async function POST(request: Request, { params }: { params: Promise<{ groupId: string; reportId: string; propertyId: string }> }) {
  const [{ groupId, reportId, propertyId }, actor] = await Promise.all([params, requireUser()]);
  const workspace = `/reporty/kvartalni/${groupId}/reporty/${reportId}?propertyId=${encodeURIComponent(propertyId)}`;
  try {
    await requireReportInGroup(reportId, groupId);
    if (!fileStorageCapabilities().upload) throw new Error("Úložiště souborů není nakonfigurováno.");
    const form = await request.formData(), files = await prepareDocumentFiles(form);
    if (files.length !== 1) throw new Error("Nahrajte právě jednu fotografii.");
    await uploadQuarterlyPropertySupportivePhoto({ reportId, reportingGroupId: groupId, propertyId, file: files[0], caption: text(form, "caption") }, actor);
    return goWithMessage(request, workspace, "ok", "Fotografie byla nahrána a použita jako doplňková.");
  } catch (error) { return goWithMessage(request, workspace, "error", quarterlyWorkflowErrorMessage(error)); }
}
