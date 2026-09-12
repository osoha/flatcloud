import { requireUser } from "@/lib/auth";
import { createRentForecastPlanRevision, rentForecastPlanErrorMessage } from "@/lib/reporting/rent-forecast-plans";
import { goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ planId: string }> }) {
  const user = await requireUser(); const { planId } = await params;
  try { const revision = await createRentForecastPlanRevision(planId, user); return goWithMessage(request, `/reporty/valorizace/${revision.id}`, "ok", `Byla vytvořena revize ${revision.revision} z aktuálních LIVE dat ve stavu Koncept.`); }
  catch (error) { return goWithMessage(request, `/reporty/valorizace/${planId}`, "error", rentForecastPlanErrorMessage(error)); }
}
