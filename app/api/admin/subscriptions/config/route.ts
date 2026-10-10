import { NextResponse } from "next/server";
import { getSubscriptionConfig, saveSubscriptionConfig } from "@/lib/subscriptions/service";
import { FEATURE_KEYS, type Features } from "@/lib/subscriptions/types";
import { centsField, checked, enumField, integerField, planField, requiredField, subscriptionActor, subscriptionFailure, subscriptionForm, subscriptionSuccess, textField } from "@/app/api/subscriptions/_shared";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const boundary = await subscriptionActor(request, true);
  if (boundary.response) return boundary.response;
  return NextResponse.json(await getSubscriptionConfig(), { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const boundary = await subscriptionActor(request, true);
  if (boundary.response) return boundary.response;
  try {
    const form = await subscriptionForm(request);
    const operation = enumField(form, "operation", ["plan", "settings"] as const);
    const reason = requiredField(form, "reason", 1000);
    const config = structuredClone(await getSubscriptionConfig());
    if (operation === "plan") {
      const code = planField(form, "planCode");
      const plan = config.plans[code];
      plan.monthlyPriceCents = centsField(form, "priceKc");
      plan.includedUnits = integerField(form, "includedUnits", 1);
      plan.additionalUnitPriceCents = centsField(form, "additionalPriceKc");
      plan.maxProperties = textField(form, "maxProperties") ? integerField(form, "maxProperties", 1) : null;
      plan.features = Object.fromEntries(FEATURE_KEYS.map(key => [key, checked(form, `feature:${key}`)])) as Features;
    } else {
      config.subscriptionBankAccount = textField(form, "subscriptionBankAccount", 80);
      config.recipientName = requiredField(form, "recipientName", 160);
      config.annualMonths = integerField(form, "annualMonths", 1, 12);
      config.graceDays = integerField(form, "graceDays", 0, 60);
      config.trialDays = integerField(form, "trialDays", 1, 90);
      const reminderDays = requiredField(form, "reminderDays", 250).split(",").map(value => value.trim());
      if (reminderDays.some(value => !/^-?\d+$/.test(value))) throw new Error("Termíny upozornění zadejte jako celá čísla oddělená čárkou.");
      config.reminderDays = [...new Set(reminderDays.map(Number))].sort((a, b) => a - b);
      config.enabled = checked(form, "enabled");
    }
    const result = await saveSubscriptionConfig(config, boundary.actor.id, reason);
    return subscriptionSuccess(request, "/nastaveni/tarify", "Nastavení tarifů bylo uloženo.", result);
  } catch (error) {
    return subscriptionFailure(request, "/nastaveni/tarify", error);
  }
}
