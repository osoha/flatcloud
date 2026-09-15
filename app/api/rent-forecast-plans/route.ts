import { requireUser } from "@/lib/auth";
import { intValue, text } from "@/lib/forms";
import { createRentForecastPlan, rentForecastPlanErrorMessage } from "@/lib/reporting/rent-forecast-plans";
import { rentForecastBasisPointsFromPercent } from "@/lib/reporting/rent-forecast";
import { goWithMessage, safeInternalReturnPath } from "@/lib/route-response";

export async function POST(request: Request) {
  const user = await requireUser();
  let returnTo = "/reporty?view=forecast";
  try {
    const form = await request.formData();
    returnTo = safeInternalReturnPath(form.get("returnTo"), returnTo);
    const plan = await createRentForecastPlan({
      name: text(form, "name", true)!, note: text(form, "note"), propertyIds: form.getAll("propertyId").map(String), expectedSnapshotFingerprint: text(form, "snapshotFingerprint", true),
      horizonMonths: intValue(form, "horizon", 24), assumptions: {
        label: "Uložený plán",
        annualGrowthBps: rentForecastBasisPointsFromPercent(String(form.get("annualGrowthPercent") || ""), "Roční růst", 2_000),
        vacancyBps: rentForecastBasisPointsFromPercent(String(form.get("vacancyPercent") || ""), "Vacancy"),
        collectionBps: rentForecastBasisPointsFromPercent(String(form.get("collectionPercent") || ""), "Úspěšnost inkasa"),
        marketGapCaptureBps: rentForecastBasisPointsFromPercent(String(form.get("marketGapCapturePercent") || ""), "Využití MF rozdílu"),
      },
    }, user);
    return goWithMessage(request, `/reporty/valorizace/${plan.id}`, "ok", "Scénář byl uložen jako koncept.");
  } catch (error) {
    return goWithMessage(request, returnTo, "error", rentForecastPlanErrorMessage(error));
  }
}
