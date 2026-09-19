import { requireUser } from "@/lib/auth";
import { intValue, moneyToCents, text } from "@/lib/forms";
import { createRentForecastPlan, rentForecastPlanErrorMessage } from "@/lib/reporting/rent-forecast-plans";
import { marketGrowthBasisPoints, rentForecastBasisPointsFromPercent } from "@/lib/reporting/rent-forecast";
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
        marketAnnualGrowthBps: marketGrowthBasisPoints(String(form.get("marketAnnualGrowthPercent") ?? "0")),
        marketCatchUpMonths: intValue(form, "marketCatchUpMonths", 24),
        annualGrowthBps: rentForecastBasisPointsFromPercent(String(form.get("annualGrowthPercent") || ""), "Roční růst", 2_000),
        vacancyBps: rentForecastBasisPointsFromPercent(String(form.get("vacancyPercent") || ""), "Vacancy"),
        collectionBps: rentForecastBasisPointsFromPercent(String(form.get("collectionPercent") || ""), "Úspěšnost inkasa"),
        marketGapCaptureBps: rentForecastBasisPointsFromPercent(String(form.get("marketGapCapturePercent") || ""), "Využití MF rozdílu"),
        expiryStrategy: text(form,"expiryStrategy")==="RELET"?"RELET":"RENEW",
        renewalMode: text(form,"renewalMode")==="TARGET_MF"?"TARGET_MF":text(form,"renewalMode")==="CUSTOM"?"CUSTOM":"AUTO",
        renewalTargetBps: rentForecastBasisPointsFromPercent(String(form.get("renewalTargetPercent")||"100"),"Cíl při prodloužení",15_000),
        renewalCustomRentCents: moneyToCents(form,"renewalCustomRent"),
        relettingTargetBps: rentForecastBasisPointsFromPercent(String(form.get("relettingTargetPercent")||"100"),"Headline rent při přeobsazení",15_000),
        relettingVacancyMonths: intValue(form,"relettingVacancyMonths",1),
      },
    }, user);
    return goWithMessage(request, `/reporty/valorizace/${plan.id}`, "ok", "Scénář byl uložen jako koncept.");
  } catch (error) {
    return goWithMessage(request, returnTo, "error", rentForecastPlanErrorMessage(error));
  }
}
