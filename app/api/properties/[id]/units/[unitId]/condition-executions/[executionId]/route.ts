import { currentUser } from "@/lib/auth";
import { dateValue, moneyToCents, text } from "@/lib/forms";
import { progressUnitConditionPlanExecution } from "@/lib/portfolio/unit-condition-execution";
import { go, goWithMessage, safeInternalReturnPath } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; unitId: string; executionId: string }> }) {
  const user = await currentUser();
  if (!user) return go(request, "/login");
  const { id, unitId, executionId } = await params;
  const form = await request.formData();
  const returnTo = safeInternalReturnPath(form.get("returnTo"), `/nemovitosti/${id}/jednotky/${unitId}#kvalita`);
  try {
    const action = text(form, "action", true);
    if (action !== "START" && action !== "COMPLETE") throw new Error("Vyberte platný krok realizace.");
    await progressUnitConditionPlanExecution(user, id, unitId, executionId, {
      action,
      effectiveAt: dateValue(form, "effectiveAt", true),
      actualAmountCents: action === "COMPLETE" ? moneyToCents(form, "actualAmount") : null,
      note: text(form, "note"),
    });
    return goWithMessage(request, returnTo, "ok", action === "START" ? "CAPEX realizace byla zahájena." : "CAPEX realizace byla dokončena a skutečný náklad zapsán.");
  } catch (error) {
    return goWithMessage(request, returnTo, "error", error instanceof Error ? error.message : "Průběh CAPEX realizace se nepodařilo uložit.");
  }
}
