import { requireUser } from "@/lib/auth";
import { processAnnualMapPhoto } from "@/lib/reporting/annual-map";
import { requireAnnualReportInGroup, updateAnnualMapPhoto } from "@/lib/reporting/annual-report-service";
import { annualWorkflowErrorMessage } from "@/lib/reporting/annual-workflow-route";
import { goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ groupId: string; reportId: string; propertyId: string }> }) {
  const [{ groupId, reportId, propertyId }, actor] = await Promise.all([params, requireUser()]); const workspace = `/reporty/vyrocni/${groupId}/reporty/${reportId}?section=map`;
  try { await requireAnnualReportInGroup(reportId, groupId); const form = await request.formData(); const remove = form.get("remove") === "1"; const photo = remove ? null : await processAnnualMapPhoto(form.get("photo")); if (!remove && !photo) throw new Error("Vyberte fotografii objektu."); await updateAnnualMapPhoto(reportId, propertyId, photo, actor); return goWithMessage(request, workspace, "ok", remove ? "Fotografie byla odstraněna." : "Fotografie objektu byla uložena."); }
  catch (error) { return goWithMessage(request, workspace, "error", annualWorkflowErrorMessage(error)); }
}
