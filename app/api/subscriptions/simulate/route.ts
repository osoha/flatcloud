import { prisma } from "@/lib/db";
import { verifySimulatedPayment } from "@/lib/subscriptions/service";
import { billingReturnPath, enumField, requiredField, subscriptionActor, subscriptionFailure, subscriptionForm, subscriptionSuccess, textField } from "@/app/api/subscriptions/_shared";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const boundary = await subscriptionActor(request, true);
  if (boundary.response) return boundary.response;
  let path = "/ucet/predplatne";
  try {
    const form = await subscriptionForm(request);
    path = billingReturnPath(form, true);
    const requestId = requiredField(form, "requestId", 100);
    const outcome = enumField(form, "outcome", ["paid", "failed"] as const);
    const payment = await prisma.subscriptionPaymentRequest.findUnique({ where: { id: requestId }, select: { amountCents: true, currency: true, recipientAccount: true, reference: true } });
    if (!payment) throw new Error("Platební požadavek nebyl nalezen.");
    const result = await verifySimulatedPayment({
      requestId, providerEventId: textField(form, "providerEventId", 200) || `ui:${requestId}:${outcome}`,
      amountCents: payment.amountCents, currency: payment.currency,
      recipientAccount: payment.recipientAccount, reference: payment.reference,
      paymentStatus: outcome === "paid" ? "PAID" : "FAILED",
    }, boundary.actor.id);
    const message = result.duplicate ? "Událost už byla zpracována. Předplatné se podruhé neprodloužilo." : result.activated ? "Simulovaná úhrada byla ověřena a předplatné aktivováno. Žádná skutečná platba neproběhla." : "Simulovaná platba nebyla potvrzena. Tarif zůstává beze změny a událost je v historii k ověření.";
    return subscriptionSuccess(request, path, message, result);
  } catch (error) { return subscriptionFailure(request, path, error); }
}
