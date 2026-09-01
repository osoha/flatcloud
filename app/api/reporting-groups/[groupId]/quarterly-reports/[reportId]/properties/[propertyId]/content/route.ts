import { requireUser } from "@/lib/auth";
import { parseAreaM2, parseCzkToCents, text } from "@/lib/forms";
import { quarterlyPropertyReportContentSchema, valuationRowsEditorSchema } from "@/lib/reporting/editorial-schema";
import { updateQuarterlyPropertyReportContent } from "@/lib/reporting/quarterly-report-service";
import { quarterlyWorkflowErrorMessage, requireReportInGroup } from "@/lib/reporting/quarterly-workflow-route";
import { goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ groupId: string; reportId: string; propertyId: string }> }) {
  const [{ groupId, reportId, propertyId }, actor] = await Promise.all([params, requireUser()]);
  const workspace = `/reporty/kvartalni/${groupId}/reporty/${reportId}?propertyId=${encodeURIComponent(propertyId)}`;
  try {
    await requireReportInGroup(reportId, groupId);
    const form = await request.formData();
    const valuationEditorRows = valuationRowsEditorSchema.parse(JSON.parse(text(form, "valuationRows", true)!));
    const valuationRows = valuationEditorRows.map((row) => {
      if (!("kind" in row)) return row;
      return {
        kind: row.kind,
        unitLabel: row.unitLabel,
        disposition: row.disposition,
        floor: row.floor,
        areaM2: parseAreaM2(row.areaM2),
        amountCents: parseCzkToCents(row.amountCzk),
      };
    });
    const input = quarterlyPropertyReportContentSchema.parse({
      propertyStatus: text(form, "propertyStatus") || null,
      managementCommentary: text(form, "managementCommentary"),
      additionalCommentary: text(form, "additionalCommentary"),
      technicalSections: JSON.parse(text(form, "technicalSections", true)!),
      valuationRows,
    });
    await updateQuarterlyPropertyReportContent(reportId, propertyId, input, actor);
    return goWithMessage(request, workspace, "ok", "Obsah nemovitosti byl uložen.");
  } catch (error) {
    return goWithMessage(request, workspace, "error", quarterlyWorkflowErrorMessage(error));
  }
}
