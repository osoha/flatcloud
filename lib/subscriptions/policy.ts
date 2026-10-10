import { FEATURE_KEYS, type ContractSnapshot, type Features, type SubscriptionConfig, type OfferKind, type AccountStatus, type BillingInterval } from "./types";

export const DAY_MS = 86_400_000;
const basicFeatures: Features = { profi: false, reports: false, bankNotifications: false, paymentMatching: false, paymentReceipts: false, electronicContracts: false, portfolioOversight: false };
const profiFeatures: Features = { ...basicFeatures, profi: true, reports: true, bankNotifications: true, paymentMatching: true, paymentReceipts: true, electronicContracts: true };
export const DEFAULT_SUBSCRIPTION_CONFIG: SubscriptionConfig = {
  version: 1, enabled: false, sandboxOnly: true, currency: "CZK", annualMonths: 10, graceDays: 7,
  trialDays: 30, reminderDays: [-7, 0, 5], subscriptionBankAccount: "", recipientName: "FlatCloud a.s.",
  plans: {
    FREE: { code: "FREE", name: "Free / Basic", monthlyPriceCents: 0, includedUnits: 3, additionalUnitPriceCents: 0, maxProperties: 1, features: basicFeatures },
    PROFI: { code: "PROFI", name: "Profi", monthlyPriceCents: 24900, includedUnits: 10, additionalUnitPriceCents: 2500, maxProperties: null, features: profiFeatures },
    ENTERPRISE: { code: "ENTERPRISE", name: "Enterprise", monthlyPriceCents: 99000, includedUnits: 50, additionalUnitPriceCents: 1500, maxProperties: null, features: { ...profiFeatures, portfolioOversight: true } },
  },
};
export function freshDefaultConfig(): SubscriptionConfig { return structuredClone(DEFAULT_SUBSCRIPTION_CONFIG); }
export function validateConfig(value: SubscriptionConfig): void {
  if (value.sandboxOnly !== true || value.currency !== "CZK") throw new Error("Modul podporuje pouze sandbox a měnu CZK.");
  if (typeof value.enabled !== "boolean") throw new Error("Neplatné zapnutí modulu.");
  for (const [name, number, min, max] of [["roční násobek", value.annualMonths, 1, 12], ["ochranná lhůta", value.graceDays, 0, 60], ["zkušební doba", value.trialDays, 1, 90]] as const) {
    if (!Number.isInteger(number) || number < min || number > max) throw new Error(`Neplatná hodnota: ${name}.`);
  }
  if (!Array.isArray(value.reminderDays) || value.reminderDays.some(n => !Number.isInteger(n) || n < -60 || n > 60)) throw new Error("Neplatné termíny upozornění.");
  if (typeof value.subscriptionBankAccount !== "string" || value.subscriptionBankAccount.length > 80 || typeof value.recipientName !== "string" || value.recipientName.length > 160) throw new Error("Neplatné platební údaje.");
  for (const code of ["FREE", "PROFI", "ENTERPRISE"] as const) {
    const plan = value.plans?.[code];
    if (!plan || plan.code !== code || !plan.name?.trim() || plan.name.length > 80) throw new Error("Neplatný tarif.");
    for (const amount of [plan.monthlyPriceCents, plan.additionalUnitPriceCents]) if (!Number.isSafeInteger(amount) || amount < 0 || amount > 100_000_000) throw new Error("Neplatná cena tarifu.");
    if (!Number.isInteger(plan.includedUnits) || plan.includedUnits < 1 || plan.includedUnits > 100_000) throw new Error("Neplatný počet jednotek.");
    if (plan.maxProperties !== null && (!Number.isInteger(plan.maxProperties) || plan.maxProperties < 1 || plan.maxProperties > 100_000)) throw new Error("Neplatný počet objektů.");
    for (const key of FEATURE_KEYS) if (typeof plan.features?.[key] !== "boolean") throw new Error("Neplatný přepínač funkce.");
    if (plan.features.paymentMatching && !plan.features.bankNotifications) throw new Error("Párování plateb vyžaduje bankovní notifikace.");
  }
  if (value.plans.FREE.monthlyPriceCents !== 0 || value.plans.FREE.additionalUnitPriceCents !== 0) throw new Error("Tarif Free musí zůstat bezplatný.");
}
export function makeContract(config: SubscriptionConfig, plan: "FREE" | "PROFI" | "ENTERPRISE", capacityUnits: number): ContractSnapshot {
  const definition = structuredClone(config.plans[plan]);
  return { version: config.version, plan: definition, capacityUnits: plan === "FREE" ? definition.includedUnits : Math.max(definition.includedUnits, capacityUnits), annualMonths: config.annualMonths, graceDays: config.graceDays, currency: "CZK" };
}
export function quoteContract(contract: ContractSnapshot, interval: BillingInterval, offer: { kind: OfferKind; until: Date | null; percent: number; fixedCents: number | null }, now: Date): number {
  const monthly = contract.plan.monthlyPriceCents + Math.max(0, contract.capacityUnits - contract.plan.includedUnits) * contract.plan.additionalUnitPriceCents;
  const baseline = monthly * (interval === "ANNUAL" ? contract.annualMonths : 1);
  const active = !offer.until || now.getTime() < offer.until.getTime();
  if (active && offer.kind === "TEAM") return 0;
  if (active && offer.kind === "FREE_UNTIL" && offer.until) return 0;
  if (active && offer.kind === "FIXED" && offer.fixedCents !== null) return offer.fixedCents * (interval === "ANNUAL" ? contract.annualMonths : 1);
  return active && offer.kind === "PERCENT" ? Math.round(baseline * (100 - offer.percent) / 100) : baseline;
}
export function addBillingPeriod(date: Date, interval: BillingInterval): Date {
  const next = new Date(date);
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + (interval === "ANNUAL" ? 12 : 1));
  const last = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, last));
  return next;
}
export function renewalStart(paidUntil: Date | null, now: Date, graceDays: number): Date {
  return paidUntil && now.getTime() < paidUntil.getTime() + graceDays * DAY_MS ? paidUntil : now;
}
export function deriveEntitlement(input: {
  contract: ContractSnapshot; config: SubscriptionConfig; paidUntil: Date | null; trialUntil: Date | null;
  offerKind: OfferKind; offerUntil: Date | null; teamEligible: boolean;
  featuresOverride: Partial<Features>; overridesUntil: Date | null; usage: { units: number; properties: number }; now: Date;
}): { status: AccountStatus; features: Features; writable: boolean; overCapacity: boolean; accessUntil: Date | null; freezeAt: Date | null; reminder: string | null; effectiveCapacityUnits: number; effectiveMaxProperties: number | null } {
  const { contract, config, now } = input;
  const free = config.plans.FREE;
  const fitsFree = input.usage.units <= free.includedUnits && (free.maxProperties === null || input.usage.properties <= free.maxProperties);
  let status: AccountStatus = "FROZEN";
  let accessUntil: Date | null = input.paidUntil;
  let freezeAt = input.paidUntil ? new Date(input.paidUntil.getTime() + contract.graceDays * DAY_MS) : null;
  let features = { ...config.plans[contract.plan.code].features };
  let capacity = contract.capacityUnits;
  let maxProperties = contract.plan.maxProperties;
  if (contract.plan.code === "FREE") { status = "FREE"; accessUntil = null; freezeAt = null; }
  else if (input.offerKind === "TEAM" && input.teamEligible) { status = "TEAM"; accessUntil = null; freezeAt = null; }
  else if (input.offerKind === "FREE_UNTIL" && input.offerUntil && now < input.offerUntil) { status = "GIFTED"; accessUntil = input.offerUntil; freezeAt = input.offerUntil; }
  else if (input.trialUntil && now < input.trialUntil) { status = "TRIAL"; accessUntil = input.trialUntil; freezeAt = input.trialUntil; }
  else if (input.paidUntil && now < input.paidUntil) status = "ACTIVE";
  else if (input.paidUntil && freezeAt && now < freezeAt) status = "GRACE";
  else if (!input.paidUntil && ((input.trialUntil && now >= input.trialUntil) || (input.offerKind === "FREE_UNTIL" && input.offerUntil && now >= input.offerUntil))) {
    status = fitsFree ? "FREE" : "FROZEN"; features = { ...free.features }; capacity = free.includedUnits; maxProperties = free.maxProperties;
  }
  const overCapacity = input.usage.units > capacity || (maxProperties !== null && input.usage.properties > maxProperties);
  if ((!input.overridesUntil || now < input.overridesUntil) && status !== "FROZEN") features = { ...features, ...input.featuresOverride };
  // Dependent actions cannot outlive their prerequisite.
  if (!features.bankNotifications) features.paymentMatching = false;
  let reminder: string | null = null;
  if (status === "FROZEN") reminder = "Přístup k práci je pozastaven. Data zůstávají uložená. Předplatné můžete obnovit v platebním nastavení.";
  else if (overCapacity) reminder = "Portfolio překračuje zakoupenou kapacitu. Data zůstávají uložená; pro další práci upravte kapacitu.";
  else if (status === "GRACE") {
    const elapsedDays = input.paidUntil ? Math.floor((now.getTime() - input.paidUntil.getTime()) / DAY_MS) : 0;
    const finalDay = Math.max(0, ...config.reminderDays.filter(day => day > 0));
    reminder = `${finalDay > 0 && elapsedDays >= finalDay ? "Poslední upozornění: " : ""}předplatné skončilo. Přístup k práci se pozastaví ${freezeAt!.toLocaleDateString("cs-CZ", { timeZone: "Europe/Prague" })}.`;
  }
  else if (accessUntil && config.reminderDays.some(day => day < 0 && accessUntil!.getTime() - now.getTime() <= Math.abs(day) * DAY_MS)) reminder = `Přístup platí do ${accessUntil.toLocaleDateString("cs-CZ", { timeZone: "Europe/Prague" })}.`;
  return { status, features, writable: status !== "FROZEN" && !overCapacity, overCapacity, accessUntil, freezeAt, reminder, effectiveCapacityUnits: capacity, effectiveMaxProperties: maxProperties };
}
