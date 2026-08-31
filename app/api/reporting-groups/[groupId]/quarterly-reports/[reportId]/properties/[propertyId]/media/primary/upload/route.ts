import { requireUser } from "@/lib/auth";
import { prepareDocumentFiles } from "@/lib/documents/upload";
import { text } from "@/lib/forms";
import { uploadQuarterlyPropertyPrimaryPhoto } from "@/lib/reporting/quarterly-report-media-service";
import { quarterlyWorkflowErrorMessage, requireReportInGroup } from "@/lib/reporting/quarterly-workflow-route";
import { goWithMessage } from "@/lib/route-response";
import { fileStorageCapabilities } from "@/lib/storage";

export async function POST(request: Request, { params }: { params: Promise<{ groupId: string; reportId: string; propertyId: string }> }) {
  const [{ groupId, reportId, propertyId }, actor] = await Promise.all([params, requireUser()]);
  const workspace = `/reporty/kvartalni/${groupId}/reporty/${reportId}?propertyId=${encodeURIComponent(propertyId)}`;
  const startedAt = Date.now();
  let stage = "request_accepted", sizeBytes: number | undefined, mimeType: string | undefined;
  console.info("Quarterly report photo upload.", { reportId, propertyId, stage, elapsedMs: 0 });
  try {
    await requireReportInGroup(reportId, groupId);
    if (!fileStorageCapabilities().upload) throw new Error("Úložiště souborů není nakonfigurováno.");
    const form = await request.formData();
    const files = await prepareDocumentFiles(form);
    if (files.length !== 1) throw new Error("Nahrajte právě jednu fotografii.");
    sizeBytes = files[0].bytes.length; mimeType = files[0].mimeType; stage = "image_prepared";
    console.info("Quarterly report photo upload.", { reportId, propertyId, sizeBytes, mimeType, stage, elapsedMs: Date.now() - startedAt });
    stage = "upload";
    await uploadQuarterlyPropertyPrimaryPhoto({ reportId, reportingGroupId: groupId, propertyId, file: files[0], caption: text(form, "caption") }, actor);
    return goWithMessage(request, workspace, "ok", "Fotografie byla nahrána a použita jako primární.");
  } catch (error) {
    console.warn("Quarterly report photo upload request failed.", { reportId, propertyId, sizeBytes, mimeType, stage, errorClass: error instanceof Error ? error.name : "UnknownError", elapsedMs: Date.now() - startedAt });
    return goWithMessage(request, workspace, "error", quarterlyWorkflowErrorMessage(error));
  }
}
