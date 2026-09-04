import { requireUser } from "@/lib/auth";
import { dateValue, text } from "@/lib/forms";
import { createRentChangeProposal } from "@/lib/reporting/rent-change-proposals";
import { rentForecastPlanErrorMessage } from "@/lib/reporting/rent-forecast-plans";
import { goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ planId: string }> }) {
  const user = await requireUser(), { planId } = await params;
  try {
    const form = await request.formData();
    const proposal = await createRentChangeProposal(user, planId, text(form, "leaseId", true)!, { effectiveFrom: dateValue(form, "effectiveFrom", true)!, legalBasis: text(form, "legalBasis", true)!, note: text(form, "note") });
    return goWithMessage(request, `/reporty/valorizace/${planId}/navrhy/${proposal.id}`, "ok", "Návrh změny byl připraven. Před potvrzením znovu zkontrolujte částku, účinnost a právní důvod.");
  } catch (error) {
    return goWithMessage(request, `/reporty/valorizace/${planId}`, "error", rentForecastPlanErrorMessage(error));
  }
}
