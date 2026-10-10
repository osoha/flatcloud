/** Sandbox subscription domain. Amounts are integer haléře, prices include VAT. */
export const PLAN_CODES = ["FREE", "PROFI", "ENTERPRISE"] as const;
export type PlanCode = typeof PLAN_CODES[number];
export const FEATURE_KEYS = ["profi", "reports", "bankNotifications", "paymentMatching", "paymentReceipts", "electronicContracts", "portfolioOversight"] as const;
export type FeatureKey = typeof FEATURE_KEYS[number];
export type Features = Record<FeatureKey, boolean>;
export type BillingInterval = "MONTHLY" | "ANNUAL";
export type PaymentMethod = "CARD" | "APPLE_PAY" | "GOOGLE_PAY" | "BANK";
export type OfferKind = "NONE" | "PERCENT" | "FIXED" | "FREE_UNTIL" | "TEAM";
export type AccountStatus = "FREE" | "ACTIVE" | "GRACE" | "FROZEN" | "TRIAL" | "GIFTED" | "TEAM" | "LEGACY";
export interface SubscriptionPlan {
  code: PlanCode; name: string; monthlyPriceCents: number; includedUnits: number;
  additionalUnitPriceCents: number; maxProperties: number | null; features: Features;
}
export interface SubscriptionConfig {
  version: number; enabled: boolean; sandboxOnly: true; currency: "CZK";
  annualMonths: number; graceDays: number; trialDays: number;
  reminderDays: number[]; subscriptionBankAccount: string; recipientName: string;
  plans: Record<PlanCode, SubscriptionPlan>;
}
export interface ContractSnapshot {
  version: number; plan: SubscriptionPlan; capacityUnits: number;
  annualMonths: number; graceDays: number; currency: "CZK";
}
export interface SubscriptionScopeInput { propertyId: string; unitId?: string | null; }
export interface SaveSubscriptionInput {
  accountId?: string; kind?: "OWN" | "CLIENT" | "INTERNAL"; payerUserId: string; ownerId?: string | null; billingName?: string; billingEmail?: string;
  plan: PlanCode; interval: BillingInterval; capacityUnits: number;
  scopes: SubscriptionScopeInput[]; paidUntil?: string | null; trialUntil?: string | null;
  offerKind?: OfferKind; offerUntil?: string | null; discountPercent?: number;
  fixedPriceCents?: number | null; featureOverrides?: Partial<Features>;
  overridesUntil?: string | null; reason: string;
  /** Set true only when the admin intentionally adopts current catalogue prices. */
  refreshContract?: boolean;
}
export interface SubscriptionScopeView {
  id: string; propertyId: string; propertyName: string; unitId: string | null; unitLabel: string | null;
}
export interface PaymentRequestView {
  id: string; reference: string; method: PaymentMethod; amountCents: number; currency: "CZK";
  recipientAccount: string; status: string; createdAt: string; paidAt: string | null;
  plan: PlanCode; interval: BillingInterval; capacityUnits: number;
}
export interface SubscriptionSummary {
  accountId: string | null; kind: "OWN" | "CLIENT" | "INTERNAL"; payerUserId: string; payerName: string; billingName: string; billingEmail: string;
  ownerId: string | null; plan: PlanCode; interval: BillingInterval; status: AccountStatus;
  recoveryArchivingAllowed: boolean; enrolled: boolean; enabled: boolean; sandboxOnly: true; writable: boolean; overCapacity: boolean;
  effectiveCapacityUnits: number; effectiveMaxProperties: number | null; features: Features; contract: ContractSnapshot; usage: { units: number; properties: number };
  paidUntil: string | null; trialUntil: string | null; accessUntil: string | null; freezeAt: string | null;
  offerKind: OfferKind; offerUntil: string | null; discountPercent: number; fixedPriceCents: number | null;
  featureOverrides: Partial<Features>; overridesUntil: string | null;
  simulationNow: string | null; recurringConsent: boolean; nextPriceCents: number; reminder: string | null; scopes: SubscriptionScopeView[];
  requests: PaymentRequestView[]; audit: { id: string; action: string; reason: string; createdAt: string; actorName: string }[];
}
export interface SubscriptionUserContext { id: string; role: string; allProperties?: boolean; flatcloudMember?: boolean; }
export interface VerifiedSimulationInput {
  requestId: string; providerEventId: string; amountCents: number; currency: string;
  recipientAccount: string; reference: string; paymentStatus: string;
}
export interface SubscriptionDecision { allowed: boolean; code?: string; message?: string; accountIds?: string[]; }
