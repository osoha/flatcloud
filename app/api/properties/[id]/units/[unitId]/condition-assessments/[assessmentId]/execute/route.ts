import { requireUser } from "@/lib/auth";
import { text } from "@/lib/forms";
import { executeApprovedUnitConditionPlan } from "@/lib/portfolio/unit-condition-execution";
import { goWithMessage, safeInternalReturnPath } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; unitId: string; assessmentId: string }> }) {
  const user = await requireUser();
  const { id, unitId, assessmentId } = await params;
  let returnTo = `/nemovitosti/${id}/jednotky/${unitId}#kvalita`;
  try {
    const form = await request.formData();
    returnTo = safeInternalReturnPath(form.get("returnTo"), returnTo);
    const result = await executeApprovedUnitConditionPlan(user, id, unitId, assessmentId, { title: text(form, "title", true) });
    return goWithMessage(request, returnTo, "ok", `CAPEX plán byl převeden do úkolu a rozpočtu pro rok ${result.budgetLine.year}.`);
  } catch (error) {
    return goWithMessage(request, returnTo, "error", error instanceof Error ? error.message : "Plán se nepodařilo převést do realizace.");
  }
}
