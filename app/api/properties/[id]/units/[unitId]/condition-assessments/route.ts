import { UnitConditionPlanStatus, UnitInvestmentUrgency, UnitQualityRating } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { dateValue, moneyToCents, text } from "@/lib/forms";
import { createUnitConditionAssessment } from "@/lib/portfolio/unit-condition-assessments";
import { goWithMessage, safeInternalReturnPath } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; unitId: string }> }) {
  const user = await requireUser();
  const { id, unitId } = await params;
  let returnTo = `/nemovitosti/${id}/jednotky/${unitId}#kvalita`;
  try {
    const form = await request.formData();
    returnTo = safeInternalReturnPath(form.get("returnTo"), returnTo);
    await createUnitConditionAssessment(user, id, unitId, {
      rating: String(form.get("rating")) as UnitQualityRating,
      investmentUrgency: String(form.get("investmentUrgency")) as UnitInvestmentUrgency,
      estimatedCapexCents: moneyToCents(form, "estimatedCapex"),
      planStatus: String(form.get("planStatus")) as UnitConditionPlanStatus,
      targetDate: dateValue(form, "targetDate"),
      assessedAt: dateValue(form, "assessedAt", true)!,
      note: text(form, "note"),
    });
    return goWithMessage(request, returnTo, "ok", "Nový snapshot kvality a plánu obnovy byl uložen.");
  } catch (error) {
    return goWithMessage(request, returnTo, "error", error instanceof Error ? error.message : "Hodnocení se nepodařilo uložit.");
  }
}
