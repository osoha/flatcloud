import { setSubscriptionSimulationDate } from "@/lib/subscriptions/service";
import { billingReturnPath, checked, dateField, requiredField, subscriptionActor, subscriptionFailure, subscriptionForm, subscriptionSuccess } from "@/app/api/subscriptions/_shared";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const boundary = await subscriptionActor(request, true);
  if (boundary.response) return boundary.response;
  let path = "/ucet/predplatne";
  try {
    const form = await subscriptionForm(request);
    path = billingReturnPath(form, true);
    const date = checked(form, "reset") ? null : dateField(form, "date");
    const result = await setSubscriptionSimulationDate(requiredField(form, "accountId", 100), date, boundary.actor.id);
    return subscriptionSuccess(request, path, date ? "Testovací datum tohoto předplatného bylo změněno." : "Předplatné opět používá skutečné datum.", result);
  } catch (error) { return subscriptionFailure(request, path, error); }
}
