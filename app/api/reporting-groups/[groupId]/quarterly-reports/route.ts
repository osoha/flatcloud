import { requireUser } from "@/lib/auth";
import { text } from "@/lib/forms";
import { createQuarterlyReport } from "@/lib/reporting/quarterly-report-service";
import { quarterlyWorkflowErrorMessage } from "@/lib/reporting/quarterly-workflow-route";
import { goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ groupId: string }> }) {
  const [{ groupId }, actor] = await Promise.all([params, requireUser()]);
  const fallback = `/reporty/kvartalni/${groupId}`;
  try {
    const form = await request.formData();
    const year = Number(text(form, "year", true));
    const quarter = Number(text(form, "quarter", true));
    if (!Number.isInteger(year) || !Number.isInteger(quarter)) throw new Error("Quarter must be 1-4.");
    const report = await createQuarterlyReport({ reportingGroupId: groupId, year, quarter }, actor);
    return goWithMessage(request, `${fallback}/reporty/${report.id}`, "ok", "Kvartální report byl založen.");
  } catch (error) {
    return goWithMessage(request, fallback, "error", quarterlyWorkflowErrorMessage(error));
  }
}
