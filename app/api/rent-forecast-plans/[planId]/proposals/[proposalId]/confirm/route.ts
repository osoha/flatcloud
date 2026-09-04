import { requireUser } from "@/lib/auth";
import { boolValue } from "@/lib/forms";
import { confirmRentChangeProposal } from "@/lib/reporting/rent-change-proposals";
import { rentForecastPlanErrorMessage } from "@/lib/reporting/rent-forecast-plans";
import { goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ planId: string; proposalId: string }> }) {
  const user = await requireUser(), { planId, proposalId } = await params;
  try {
    const form = await request.formData();
    if (!boolValue(form, "confirm")) throw new Error("Před potvrzením potvrďte kontrolu částky, účinnosti a právního důvodu.");
    await confirmRentChangeProposal(user, planId, proposalId);
    return goWithMessage(request, `/reporty/valorizace/${planId}/navrhy/${proposalId}`, "ok", "Změna nájemného byla potvrzena a budoucí neuhrazené předpisy synchronizovány.");
  } catch (error) {
    return goWithMessage(request, `/reporty/valorizace/${planId}/navrhy/${proposalId}`, "error", rentForecastPlanErrorMessage(error));
  }
}
