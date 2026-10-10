import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { saveUserSubscription, summaryForUser } from "@/lib/subscriptions/service";
import type { SaveSubscriptionInput } from "@/lib/subscriptions/types";
import { centsField, checked, dateField, enumField, featureOverrides, integerField, intervalField, offerField, planField, requiredField, stringList, subscriptionActor, subscriptionFailure, subscriptionForm, subscriptionSuccess, textField } from "@/app/api/subscriptions/_shared";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  const boundary = await subscriptionActor(request, true);
  if (boundary.response) return boundary.response;
  const { id } = await context.params;
  try { return NextResponse.json(await summaryForUser(id, { includeBilling: true }), { headers: { "Cache-Control": "private, no-store" } }); }
  catch { return NextResponse.json({ error: "Uživatel nebyl nalezen." }, { status: 404 }); }
}

export async function POST(request: Request, context: Context) {
  const boundary = await subscriptionActor(request, true);
  if (boundary.response) return boundary.response;
  const { id } = await context.params;
  const path = `/uzivatele/${encodeURIComponent(id)}#predplatne`;
  try {
    const form = await subscriptionForm(request);
    const propertyIds = stringList(form, "propertyIds");
    const unitIds = stringList(form, "unitIds");
    const units = unitIds.length ? await prisma.unit.findMany({ where: { id: { in: unitIds } }, select: { id: true, propertyId: true } }) : [];
    if (units.length !== unitIds.length) throw new Error("Některá vybraná jednotka už není dostupná.");
    // A checked whole property takes precedence over individual units in that property.
    const scopes = [...propertyIds.map(propertyId => ({ propertyId, unitId: null })), ...units.filter(unit => !propertyIds.includes(unit.propertyId)).map(unit => ({ propertyId: unit.propertyId, unitId: unit.id }))];
    const billingEmail = requiredField(form, "billingEmail", 200);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billingEmail)) throw new Error("Doplňte platný e-mail pro předplatné.");
    const input: SaveSubscriptionInput = {
      accountId: textField(form, "accountId", 100) || undefined,
      payerUserId: id,
      kind: enumField(form, "kind", ["OWN", "CLIENT", "INTERNAL"] as const, "OWN"),
      ownerId: textField(form, "ownerId", 100) || null,
      billingName: requiredField(form, "billingName", 200), billingEmail,
      plan: planField(form), interval: intervalField(form), capacityUnits: integerField(form, "capacityUnits", 1), scopes,
      paidUntil: dateField(form, "paidUntil"), trialUntil: dateField(form, "trialUntil"),
      offerKind: offerField(form), offerUntil: dateField(form, "offerUntil"),
      discountPercent: textField(form, "discountPercent") ? integerField(form, "discountPercent", 0, 100) : 0,
      fixedPriceCents: textField(form, "fixedPriceKc") ? centsField(form, "fixedPriceKc") : null,
      featureOverrides: featureOverrides(form), overridesUntil: dateField(form, "overridesUntil"),
      refreshContract: checked(form, "refreshContract"), reason: requiredField(form, "reason", 1000),
    };
    const result = await saveUserSubscription(input, boundary.actor.id);
    return subscriptionSuccess(request, path, "Předplatné a rozsah portfolia byly uloženy.", result);
  } catch (error) { return subscriptionFailure(request, path, error); }
}
