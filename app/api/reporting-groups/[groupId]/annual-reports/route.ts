import { requireUser } from "@/lib/auth";
import { text } from "@/lib/forms";
import { createAnnualReport } from "@/lib/reporting/annual-report-service";
import { annualWorkflowErrorMessage } from "@/lib/reporting/annual-workflow-route";
import { goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ groupId: string }> }) {
  const [{ groupId }, actor] = await Promise.all([params, requireUser()]);
  const fallback = `/reporty/vyrocni/${groupId}`;
  try {
    const form = await request.formData();
    const year = Number(text(form, "year", true));
    const report = await createAnnualReport({ reportingGroupId: groupId, year }, actor);
    return goWithMessage(request, `${fallback}/reporty/${report.id}`, "ok", "Výroční report byl založen.");
  } catch (error) {
    return goWithMessage(request, fallback, "error", annualWorkflowErrorMessage(error));
  }
}
