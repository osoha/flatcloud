import { requireUser } from "@/lib/auth";
import { intValue, text } from "@/lib/forms";
import { createRentForecastPlan, rentForecastPlanErrorMessage } from "@/lib/reporting/rent-forecast-plans";
import { parseRentForecastScenario } from "@/lib/reporting/rent-forecast";
import { goWithMessage, safeInternalReturnPath } from "@/lib/route-response";

export async function POST(request: Request) {
  const user = await requireUser();
  let returnTo = "/reporty?view=forecast";
  try {
    const form = await request.formData();
    returnTo = safeInternalReturnPath(form.get("returnTo"), returnTo);
    const plan = await createRentForecastPlan({
      name: text(form, "name", true)!, note: text(form, "note"), propertyIds: form.getAll("propertyId").map(String),
      horizonMonths: intValue(form, "horizon", 24), scenarioKey: parseRentForecastScenario(String(form.get("scenario") || "base")),
    }, user);
    return goWithMessage(request, `/reporty/valorizace/${plan.id}`, "ok", "Scénář byl uložen jako koncept.");
  } catch (error) {
    return goWithMessage(request, returnTo, "error", rentForecastPlanErrorMessage(error));
  }
}
