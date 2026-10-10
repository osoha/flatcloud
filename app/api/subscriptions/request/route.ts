import { createPaymentRequest } from "@/lib/subscriptions/service";
import { billingReturnPath, integerField, intervalField, methodField, planField, requiredField, subscriptionActor, subscriptionFailure, subscriptionForm, subscriptionPayerBoundary, subscriptionSuccess, textField } from "@/app/api/subscriptions/_shared";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const boundary = await subscriptionActor(request);
  if (boundary.response) return boundary.response;
  let path = "/ucet/predplatne";
  try {
    const form = await subscriptionForm(request);
    path = billingReturnPath(form, boundary.actor.role === "SUPER_ADMIN");
    const accountId = requiredField(form, "accountId", 100);
    const denied = await subscriptionPayerBoundary(accountId, boundary.actor);
    if (denied) return denied;
    const result = await createPaymentRequest(accountId, methodField(form), boundary.actor.id, {
      plan: textField(form, "plan") ? planField(form) : undefined,
      interval: textField(form, "interval") ? intervalField(form) : undefined,
      capacityUnits: textField(form, "capacityUnits") ? integerField(form, "capacityUnits", 1) : undefined,
    });
    return subscriptionSuccess(request, path, "Testovací platební požadavek byl vytvořen. Tarif se aktivuje až po potvrzení úhrady super-adminem v sandboxu.", result);
  } catch (error) { return subscriptionFailure(request, path, error); }
}
