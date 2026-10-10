import { setRecurringConsent } from "@/lib/subscriptions/service";
import { billingReturnPath, checked, requiredField, subscriptionActor, subscriptionFailure, subscriptionForm, subscriptionPayerBoundary, subscriptionSuccess } from "@/app/api/subscriptions/_shared";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const boundary = await subscriptionActor(request);
  if (boundary.response) return boundary.response;
  let path = "/ucet/predplatne";
  try {
    const form = await subscriptionForm(request);
    path = billingReturnPath(form, boundary.actor.role === "SUPER_ADMIN");
    const consent = checked(form, "consent");
    const accountId = requiredField(form, "accountId", 100);
    const denied = await subscriptionPayerBoundary(accountId, boundary.actor);
    if (denied) return denied;
    const result = await setRecurringConsent(accountId, consent, boundary.actor.id);
    return subscriptionSuccess(request, path, consent ? "Souhlas s opakovanými platbami v simulaci byl uložen. Žádná karta není připojena." : "Opakované platby byly vypnuty.", result);
  } catch (error) { return subscriptionFailure(request, path, error); }
}
