import { requireUser } from "@/lib/auth";
import { approveRentForecastPlan, rentForecastPlanErrorMessage } from "@/lib/reporting/rent-forecast-plans";
import { goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ planId: string }> }) {
  const user = await requireUser(); const { planId } = await params;
  try { await approveRentForecastPlan(planId, user); return goWithMessage(request, `/reporty/valorizace/${planId}`, "ok", "Scénář byl schválen. Smlouvy ani předpisy se nezměnily."); }
  catch (error) { return goWithMessage(request, `/reporty/valorizace/${planId}`, "error", rentForecastPlanErrorMessage(error)); }
}
