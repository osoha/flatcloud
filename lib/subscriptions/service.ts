import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "../db";
import { DAY_MS, addBillingPeriod, deriveEntitlement, freshDefaultConfig, makeContract, quoteContract, renewalStart, validateConfig } from "./policy";
import { FEATURE_KEYS, PLAN_CODES, type BillingInterval, type ContractSnapshot, type FeatureKey, type Features, type PaymentMethod, type PaymentRequestView, type SaveSubscriptionInput, type SubscriptionConfig, type SubscriptionDecision, type SubscriptionScopeInput, type SubscriptionSummary, type SubscriptionUserContext, type VerifiedSimulationInput } from "./types";

type Db = Prisma.TransactionClient;
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const iso = (value: Date | null | undefined) => value?.toISOString() ?? null;
const accountInclude = {
  payer: { select: { id: true, name: true, email: true, role: true, flatcloudMember: true } },
  scopes: { include: { property: { select: { id: true, name: true, active: true, owner: { select: { userId: true, affiliation: true } }, ownerships: { select: { owner: { select: { userId: true, affiliation: true } } } }, units: { select: { id: true, status: true, operationalStatus: true, ownerships: { select: { owner: { select: { userId: true, affiliation: true } } } } } } } }, unit: { select: { id: true, label: true, status: true, operationalStatus: true, ownerships: { select: { owner: { select: { userId: true, affiliation: true } } } } } } } },
  paymentRequests: { orderBy: { createdAt: "desc" as const }, take: 20 },
  audits: { include: { actor: { select: { name: true } } }, orderBy: { createdAt: "desc" as const }, take: 30 },
} satisfies Prisma.SubscriptionAccountInclude;
type LoadedAccount = Prisma.SubscriptionAccountGetPayload<{ include: typeof accountInclude }>;
export function subscriptionsSandboxEnabled(): boolean {
  if (process.env.FLATBERRY_SUBSCRIPTIONS_SANDBOX !== "1" || process.env.IS_SANDBOX === "0") return false;
  try {
    const database = new URL(process.env.DATABASE_URL ?? "");
    if (process.env.RENDER_SERVICE_ID) return process.env.RENDER_SERVICE_ID === "srv-dacselkmqu1s73bmjoq0" && process.env.RENDER_GIT_BRANCH === "sandbox/ux-agent" && database.pathname === "/flatcloud_ux_sandbox";
    return ["localhost", "127.0.0.1", "postgres"].includes(database.hostname);
  } catch { return false; }
}
export const isSubscriptionSandbox = subscriptionsSandboxEnabled;
function requireSandbox(): void { if (!isSubscriptionSandbox()) throw new Error("Předplatné je dostupné pouze v povoleném sandboxu."); }
async function requireAdmin(actorId: string, db: Db = prisma) { const user = await db.user.findUnique({ where: { id: actorId }, select: { role: true } }); if (user?.role !== "SUPER_ADMIN") throw new Error("Nastavení předplatného může měnit pouze super-admin."); }
async function requirePayerOrAdmin(accountId: string, actorId: string, db: Db = prisma) {
  const [account, actor] = await Promise.all([db.subscriptionAccount.findUnique({ where: { id: accountId }, select: { payerUserId: true } }), db.user.findUnique({ where: { id: actorId }, select: { role: true } })]);
  if (!account || (account.payerUserId !== actorId && actor?.role !== "SUPER_ADMIN")) throw new Error("K platebnímu účtu nemáte přístup.");
}
function date(value: string | null | undefined): Date | null { if (!value) return null; const parsed = new Date(value); if (!Number.isFinite(parsed.getTime())) throw new Error("Neplatné datum."); return parsed; }
async function serializable<T>(operation: (db: Db) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) { try { return await prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); } catch (error) { if (attempt < 3 && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") continue; throw error; } }
}
export async function getSubscriptionConfig(db: Db = prisma): Promise<SubscriptionConfig> {
  const row = await db.subscriptionSetting.findUnique({ where: { id: "global" } });
  if (!row) { const config = freshDefaultConfig(); config.enabled = subscriptionsSandboxEnabled(); return config; }
  const config = row.value as unknown as SubscriptionConfig; validateConfig(config); return config;
}
export async function subscriptionsEnabled(): Promise<boolean> { return isSubscriptionSandbox() && (await getSubscriptionConfig()).enabled; }
export async function saveSubscriptionConfig(config: SubscriptionConfig, actorId: string, reason = "Úprava tarifů a platebního nastavení"): Promise<SubscriptionConfig> {
  requireSandbox(); await requireAdmin(actorId); validateConfig(config); if (!reason.trim()) throw new Error("Doplňte důvod změny.");
  return serializable(async db => {
    const previous = await getSubscriptionConfig(db); if (config.version !== previous.version) throw new Error("Nastavení mezitím změnil jiný uživatel. Obnovte stránku a zkuste změnu znovu."); const next = { ...config, version: previous.version + 1, sandboxOnly: true as const };
    await db.subscriptionSetting.upsert({ where: { id: "global" }, create: { id: "global", value: json(next) }, update: { value: json(next) } });
    await db.subscriptionAudit.create({ data: { actorId, action: "CONFIG_UPDATED", reason: reason.slice(0, 1000), before: json(previous), after: json(next) } }); return next;
  });
}
function activeUnit(unit: { status: string; operationalStatus: string }): boolean { return unit.status !== "INACTIVE" && unit.operationalStatus !== "INACTIVE"; }
function usageOf(account: LoadedAccount): { units: number; properties: number } {
  const units = new Set<string>(), properties = new Set<string>();
  for (const scope of account.scopes) { if (!scope.property.active) continue; properties.add(scope.propertyId); for (const unit of scope.unit ? [scope.unit] : scope.property.units) if (activeUnit(unit)) units.add(unit.id); }
  return { units: units.size, properties: properties.size };
}
function teamEligible(account: LoadedAccount): boolean {
  if (!account.payer.flatcloudMember || account.kind === "CLIENT" || !account.scopes.length) return false;
  const own = (owner: { userId: string | null; affiliation: string }) => account.kind === "INTERNAL" ? ["FLATCLOUD_PARENT", "FLATCLOUD_GROUP"].includes(owner.affiliation) : owner.userId === account.payerUserId;
  return account.scopes.every(scope => {
    if (scope.unit) return scope.unit.ownerships.length ? scope.unit.ownerships.some(row => own(row.owner)) : own(scope.property.owner);
    if (!own(scope.property.owner) || scope.property.ownerships.some(row => !own(row.owner))) return false;
    return scope.property.units.every(unit => !unit.ownerships.length || unit.ownerships.some(row => own(row.owner)));
  });
}
function requestView(request: LoadedAccount["paymentRequests"][number]): PaymentRequestView {
  const contract = request.contractSnapshot as unknown as ContractSnapshot;
  return { id: request.id, reference: request.reference, method: request.method as PaymentMethod, amountCents: request.amountCents, currency: "CZK", recipientAccount: request.recipientAccount, status: request.status, createdAt: request.createdAt.toISOString(), paidAt: iso(request.paidAt), plan: contract.plan.code, interval: request.interval as BillingInterval, capacityUnits: contract.capacityUnits };
}
function summaryOf(account: LoadedAccount, config: SubscriptionConfig, at?: Date): SubscriptionSummary {
  const contract = account.contract as unknown as ContractSnapshot;
  const now = at ?? account.simulationNow ?? new Date(); const usage = usageOf(account); const eligible = teamEligible(account);
  const featureOverrides = account.featureOverrides as Partial<Features>;
  const effectiveOffer = eligible ? "TEAM" : account.offerKind as SubscriptionSummary["offerKind"];
  const entitlement = deriveEntitlement({ contract, config, paidUntil: account.paidUntil, trialUntil: account.trialUntil, offerKind: effectiveOffer, offerUntil: account.offerUntil, teamEligible: eligible, featuresOverride: featureOverrides, overridesUntil: account.overridesUntil, usage, now });
  return { accountId: account.id, kind: account.kind as SubscriptionSummary["kind"], payerUserId: account.payerUserId, payerName: account.payer.name, billingName: account.billingName, billingEmail: account.billingEmail, ownerId: account.ownerId, plan: account.plan as SubscriptionSummary["plan"], interval: account.interval as BillingInterval, ...entitlement, recoveryArchivingAllowed: Boolean(entitlement.overCapacity && (entitlement.status !== "FROZEN" || account.plan === "FREE" || (!account.paidUntil && ((account.trialUntil && now >= account.trialUntil) || (account.offerKind === "FREE_UNTIL" && account.offerUntil && now >= account.offerUntil))))), enrolled: true, enabled: config.enabled && isSubscriptionSandbox(), sandboxOnly: true, contract, usage, paidUntil: iso(account.paidUntil), trialUntil: iso(account.trialUntil), accessUntil: iso(entitlement.accessUntil), freezeAt: iso(entitlement.freezeAt), offerKind: effectiveOffer, offerUntil: iso(account.offerUntil), discountPercent: account.discountPercent, fixedPriceCents: account.fixedPriceCents, featureOverrides, overridesUntil: iso(account.overridesUntil), simulationNow: iso(account.simulationNow), recurringConsent: account.recurringConsent, nextPriceCents: quoteContract(contract, account.interval as BillingInterval, { kind: effectiveOffer, until: account.offerUntil, percent: account.discountPercent, fixedCents: account.fixedPriceCents }, now), scopes: account.scopes.map(scope => ({ id: scope.id, propertyId: scope.propertyId, propertyName: scope.property.name, unitId: scope.unitId, unitLabel: scope.unit?.label ?? null })), requests: account.paymentRequests.map(requestView), audit: account.audits.map(audit => ({ id: audit.id, action: audit.action, reason: audit.reason, createdAt: audit.createdAt.toISOString(), actorName: audit.actor.name })) };
}
function legacySummary(user: { id: string; name: string; email: string }, config: SubscriptionConfig): SubscriptionSummary {
  return { accountId: null, kind: "OWN", payerUserId: user.id, payerName: user.name, billingName: user.name, billingEmail: user.email, ownerId: null, plan: "ENTERPRISE", interval: "MONTHLY", status: "LEGACY", recoveryArchivingAllowed: false, enrolled: false, enabled: config.enabled && isSubscriptionSandbox(), sandboxOnly: true, writable: true, overCapacity: false, effectiveCapacityUnits: 100_000, effectiveMaxProperties: null, features: Object.fromEntries(FEATURE_KEYS.map(key => [key, true])) as Features, contract: makeContract(config, "ENTERPRISE", 100_000), usage: { units: 0, properties: 0 }, paidUntil: null, trialUntil: null, accessUntil: null, freezeAt: null, offerKind: "NONE", offerUntil: null, discountPercent: 0, fixedPriceCents: null, featureOverrides: {}, overridesUntil: null, simulationNow: null, recurringConsent: false, nextPriceCents: 0, reminder: "Stávající portfolio zatím není zařazené do předplatného. Funkce zůstávají dostupné.", scopes: [], requests: [], audit: [] };
}
export async function getSubscriptionSummary(accountId: string, now?: Date, db: Db = prisma): Promise<SubscriptionSummary> {
  const [account, config] = await Promise.all([db.subscriptionAccount.findUnique({ where: { id: accountId }, include: accountInclude }), getSubscriptionConfig(db)]); if (!account) throw new Error("Předplatné nebylo nalezeno."); return summaryOf(account, config, now);
}
/** Existing ACL determines which subscribed portfolios a user can see; billing never grants access. */
export async function summaryForUser(userId: string, options: { now?: Date; includeBilling?: boolean } = {}, db: Db = prisma): Promise<SubscriptionSummary[]> {
  const [user, config] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, role: true, allProperties: true } }), getSubscriptionConfig(db),
  ]);
  if (!user) throw new Error("Uživatel nebyl nalezen.");
  const visibleUnits = await db.unit.findMany({ where: ["SUPER_ADMIN", "MANAGER"].includes(user.role) || user.allProperties ? {} : { OR: [
    { ownerships: { some: { owner: { userId } } } }, { userAccesses: { some: { userId } } },
    { property: { memberships: { some: { userId } }, ...(user.role === "OWNER_VIEWER" ? { OR: [{ memberships: { some: { userId, permission: { in: ["EDIT", "ADMIN"] } } } }, { units: { none: { ownerships: { some: { owner: { userId } } } } } }] } : {}) } },
  ] }, select: { id: true, propertyId: true, status: true, operationalStatus: true } });
  const visibleProperties = new Set(visibleUnits.map(unit => unit.propertyId));
  const memberships = await db.userProperty.findMany({ where: { userId }, select: { propertyId: true } });
  for (const membership of memberships) visibleProperties.add(membership.propertyId);
  const accounts = await db.subscriptionAccount.findMany({ where: { OR: [
    { payerUserId: userId },
    { scopes: { some: { OR: [ { unitId: { in: visibleUnits.map(unit => unit.id) } }, { unitId: null, propertyId: { in: [...visibleProperties] } } ] } } },
  ] }, include: accountInclude, orderBy: { createdAt: "asc" } });
  if (!accounts.length) return [legacySummary(user, config)];
  return accounts.map((account): SubscriptionSummary => {
    const summary = summaryOf(account, config, options.now);
    if (account.payerUserId === userId || options.includeBilling) return summary;
    const scopes = summary.scopes.filter(scope => scope.unitId ? visibleUnits.some(unit => unit.id === scope.unitId) : visibleProperties.has(scope.propertyId));
    const coveredUnitIds = new Set(account.scopes.flatMap(scope => scope.unitId ? [scope.unitId] : scope.property.units.map(unit => unit.id)));
    const units = visibleUnits.filter(unit => coveredUnitIds.has(unit.id) && activeUnit(unit));
    return { ...summary, scopes, usage: { units: units.length, properties: new Set(scopes.map(scope => scope.propertyId)).size }, effectiveCapacityUnits: 0, effectiveMaxProperties: null, billingName: "", billingEmail: "", ownerId: null, payerName: "Správce předplatného", contract: { ...summary.contract, capacityUnits: 0, plan: { ...summary.contract.plan, monthlyPriceCents: 0, additionalUnitPriceCents: 0, includedUnits: 0, maxProperties: null } }, requests: [], audit: [], nextPriceCents: 0, offerKind: "NONE", offerUntil: null, discountPercent: 0, fixedPriceCents: null, featureOverrides: {}, overridesUntil: null, recurringConsent: false };
  }).filter(summary => summary.payerUserId === userId || summary.scopes.length > 0);
}
async function validateScopes(scopes: SubscriptionScopeInput[], accountId: string | null, db: Db): Promise<void> {
  const keys = new Set<string>(); const whole = new Set(scopes.filter(s => !s.unitId).map(s => s.propertyId));
  for (const scope of scopes) { const key = scope.unitId ? `U:${scope.unitId}` : `P:${scope.propertyId}`; if (keys.has(key) || (scope.unitId && whole.has(scope.propertyId))) throw new Error("Objekt a jeho jednotky nelze v jednom předplatném započítat dvakrát."); keys.add(key); }
  const properties = await db.property.findMany({ where: { id: { in: [...new Set(scopes.map(s => s.propertyId))] } }, select: { id: true, units: { select: { id: true } } } });
  for (const scope of scopes) { const property = properties.find(p => p.id === scope.propertyId); if (!property || (scope.unitId && !property.units.some(u => u.id === scope.unitId))) throw new Error("Vybraná jednotka nepatří do objektu."); }
  const conflicts = await db.subscriptionScope.findMany({ where: { ...(accountId ? { accountId: { not: accountId } } : {}), propertyId: { in: scopes.map(s => s.propertyId) } }, select: { propertyId: true, unitId: true } });
  if (scopes.some(scope => conflicts.some(conflict => conflict.propertyId === scope.propertyId && (!scope.unitId || !conflict.unitId || scope.unitId === conflict.unitId)))) throw new Error("Objekt nebo jednotku už pokrývá jiné předplatné. Nejprve upravte jeho rozsah.");
}
export async function saveUserSubscription(input: SaveSubscriptionInput, actorId: string): Promise<SubscriptionSummary> {
  requireSandbox(); await requireAdmin(actorId);
  if (!PLAN_CODES.includes(input.plan) || !["MONTHLY", "ANNUAL"].includes(input.interval) || !["OWN", "CLIENT", "INTERNAL"].includes(input.kind ?? "OWN")) throw new Error("Neplatný tarif nebo platební období.");
  if (!input.reason?.trim()) throw new Error("Doplňte důvod změny.");
  if (!Number.isInteger(input.capacityUnits) || input.capacityUnits < 1 || input.capacityUnits > 100_000) throw new Error("Neplatná kapacita.");
  if (!["NONE", "PERCENT", "FIXED", "FREE_UNTIL", "TEAM"].includes(input.offerKind ?? "NONE")) throw new Error("Neplatná nabídka.");
  const percent = input.discountPercent ?? 0; if (!Number.isInteger(percent) || percent < 0 || percent > 100) throw new Error("Sleva musí být od 0 do 100 %.");
  if (input.fixedPriceCents != null && (!Number.isSafeInteger(input.fixedPriceCents) || input.fixedPriceCents < 0 || input.fixedPriceCents > 100_000_000)) throw new Error("Neplatná zvýhodněná cena.");
  if (input.offerKind === "FIXED" && input.fixedPriceCents == null) throw new Error("Doplňte zvýhodněnou cenu.");
  if (input.offerKind === "FREE_UNTIL" && !input.offerUntil) throw new Error("Bezplatné období musí mít datum ukončení.");
  for (const [key, value] of Object.entries(input.featureOverrides ?? {})) if (!FEATURE_KEYS.includes(key as FeatureKey) || typeof value !== "boolean") throw new Error("Neplatná výjimka funkce.");
  const accountId = await serializable(async db => {
    // Serializes scope assignment to prevent two payers racing for the same unit.
    const config = await getSubscriptionConfig(db);
    await db.subscriptionSetting.upsert({ where: { id: "global" }, create: { id: "global", value: json(config) }, update: {} });
    await db.$queryRaw`SELECT "id" FROM "SubscriptionSetting" WHERE "id" = 'global' FOR UPDATE`;
    const payer = await db.user.findUnique({ where: { id: input.payerUserId }, select: { name: true, email: true } }); if (!payer) throw new Error("Plátce nebyl nalezen.");
    const before = input.accountId ? await db.subscriptionAccount.findUnique({ where: { id: input.accountId }, include: accountInclude }) : null;
    if (input.accountId && !before) throw new Error("Předplatné nebylo nalezeno.");
    if (before && before.payerUserId !== input.payerUserId) throw new Error("Plátce existujícího předplatného nelze změnit.");
    if (!before && (input.kind ?? "OWN") === "OWN" && await db.subscriptionAccount.count({ where: { payerUserId: input.payerUserId, kind: "OWN" } })) throw new Error("Uživatel už má vlastní předplatné; upravte jej nebo založte klientské portfolio.");
    const effectiveNow = before?.simulationNow ?? new Date();
    if (input.trialUntil && date(input.trialUntil)?.getTime() !== before?.trialUntil?.getTime() && date(input.trialUntil)! <= effectiveNow) throw new Error("Nová zkušební doba musí skončit v budoucnosti.");
    if (input.offerKind && !["NONE", "TEAM"].includes(input.offerKind) && (!input.offerUntil || (date(input.offerUntil)?.getTime() !== before?.offerUntil?.getTime() && date(input.offerUntil)! <= effectiveNow))) throw new Error("Marketingová nabídka musí mít budoucí datum ukončení.");
    await validateScopes(input.scopes, before?.id ?? null, db);
    const priorContract = before?.contract as unknown as ContractSnapshot | undefined;
    const contract = priorContract && before?.plan === input.plan && !input.refreshContract ? { ...priorContract, capacityUnits: input.plan === "FREE" ? priorContract.plan.includedUnits : Math.max(priorContract.plan.includedUnits, input.capacityUnits) } : makeContract(config, input.plan, input.capacityUnits);
    const data = { payerUserId: input.payerUserId, kind: input.kind ?? before?.kind ?? "OWN", ownerId: input.ownerId || null, billingName: (input.billingName?.trim() || payer.name).slice(0, 200), billingEmail: (input.billingEmail?.trim() || payer.email).slice(0, 200), plan: input.plan, interval: input.interval, contract: json(contract), paidUntil: date(input.paidUntil), trialUntil: date(input.trialUntil), offerKind: input.offerKind ?? "NONE", offerUntil: date(input.offerUntil), discountPercent: percent, fixedPriceCents: input.fixedPriceCents ?? null, featureOverrides: json(input.featureOverrides ?? {}), overridesUntil: date(input.overridesUntil) };
    const account = before ? await db.subscriptionAccount.update({ where: { id: before.id }, data }) : await db.subscriptionAccount.create({ data });
    await db.subscriptionScope.deleteMany({ where: { accountId: account.id } });
    if (input.scopes.length) await db.subscriptionScope.createMany({ data: input.scopes.map(scope => ({ accountId: account.id, propertyId: scope.propertyId, unitId: scope.unitId || null, scopeKey: scope.unitId ? `U:${scope.unitId}` : `P:${scope.propertyId}` })) });
    const loaded = await db.subscriptionAccount.findUniqueOrThrow({ where: { id: account.id }, include: accountInclude });
    if (input.offerKind === "TEAM" && !teamEligible(loaded)) throw new Error("Osvobození týmu lze použít pouze na vlastní nebo ověřené interní portfolio člena FlatCloud.");
    await db.subscriptionAudit.create({ data: { accountId: account.id, actorId, action: before ? "ACCOUNT_UPDATED" : "ACCOUNT_ENROLLED", reason: input.reason.slice(0, 1000), before: before ? json({ contract: before.contract, scopes: before.scopes.map(s => s.scopeKey), offerKind: before.offerKind }) : Prisma.JsonNull, after: json({ ...data, scopes: input.scopes }) } });
    return account.id;
  }); return getSubscriptionSummary(accountId);
}
export async function setSubscriptionSimulationDate(accountId: string, value: string | null, actorId: string): Promise<SubscriptionSummary> {
  requireSandbox(); await requireAdmin(actorId); const simulationNow = date(value);
  await serializable(async db => { const before = await db.subscriptionAccount.findUniqueOrThrow({ where: { id: accountId } }); await db.subscriptionAccount.update({ where: { id: accountId }, data: { simulationNow } }); await db.subscriptionAudit.create({ data: { accountId, actorId, action: "SIMULATION_CLOCK", reason: simulationNow ? `Testovací datum: ${simulationNow.toISOString()}` : "Obnovené skutečné datum", before: json({ simulationNow: iso(before.simulationNow) }), after: json({ simulationNow: iso(simulationNow) }) } }); }); return getSubscriptionSummary(accountId);
}
export async function setRecurringConsent(accountId: string, consent: boolean, actorId: string): Promise<SubscriptionSummary> {
  requireSandbox(); await requirePayerOrAdmin(accountId, actorId);
  await serializable(async db => { await db.subscriptionAccount.update({ where: { id: accountId }, data: { recurringConsent: consent } }); await db.subscriptionAudit.create({ data: { accountId, actorId, action: "RECURRING_CONSENT", reason: consent ? "Souhlas s opakovanými platbami v simulaci; žádná skutečná karta není připojená." : "Opakované platby vypnuté." } }); }); return getSubscriptionSummary(accountId);
}
export async function createPaymentRequest(accountId: string, method: PaymentMethod, actorId: string, options: { plan?: "FREE" | "PROFI" | "ENTERPRISE"; capacityUnits?: number; interval?: BillingInterval; now?: Date } = {}): Promise<PaymentRequestView> {
  requireSandbox(); await requirePayerOrAdmin(accountId, actorId); if (!["CARD", "APPLE_PAY", "GOOGLE_PAY", "BANK"].includes(method)) throw new Error("Neplatný způsob platby.");
  const [account, config] = await Promise.all([prisma.subscriptionAccount.findUniqueOrThrow({ where: { id: accountId }, include: accountInclude }), getSubscriptionConfig()]);
  const now = options.now ?? account.simulationNow ?? new Date(); const prior = account.contract as unknown as ContractSnapshot; const target = options.plan ?? prior.plan.code;
  if (!PLAN_CODES.includes(target) || target === "FREE") throw new Error("Bezplatný tarif nevyžaduje platbu.");
  const capacity = options.capacityUnits ?? prior.capacityUnits; if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100_000) throw new Error("Neplatná kapacita.");
  const interval = options.interval ?? account.interval as BillingInterval; if (!["MONTHLY", "ANNUAL"].includes(interval)) throw new Error("Neplatné období.");
  const contract = target === prior.plan.code ? { ...prior, capacityUnits: Math.max(prior.plan.includedUnits, capacity) } : makeContract(config, target, capacity);
  const usage = usageOf(account); if (usage.units > contract.capacityUnits || (contract.plan.maxProperties !== null && usage.properties > contract.plan.maxProperties)) throw new Error("Zvolená kapacita nepokrývá aktuální portfolio.");
  const kind = teamEligible(account) ? "TEAM" : account.offerKind as SubscriptionSummary["offerKind"];
  const amountCents = quoteContract(contract, interval, { kind: kind === "FREE_UNTIL" ? "NONE" : kind, until: account.offerUntil, percent: account.discountPercent, fixedCents: account.fixedPriceCents }, now);
  if (amountCents <= 0) throw new Error("Portfolio má aktuálně bezplatný přístup; platební požadavek není potřeba.");
  if (method === "BANK" && !config.subscriptionBankAccount.trim()) throw new Error("Super-admin musí nejprve nastavit účet pro předplatné.");
  if (!Number.isSafeInteger(amountCents) || amountCents > 2_147_483_647) throw new Error("Částka požadavku překračuje podporovaný rozsah.");
  const reference = `FB${randomUUID().replaceAll("-", "").slice(0, 18).toUpperCase()}`;
  const request = await serializable(async db => {
    const created = await db.subscriptionPaymentRequest.create({ data: { accountId, reference, method, amountCents, currency: "CZK", recipientAccount: method === "BANK" ? config.subscriptionBankAccount.trim() : "SANDBOX_GATEWAY", contractSnapshot: json(contract), interval } });
    await db.subscriptionAudit.create({ data: { accountId, actorId, action: "PAYMENT_REQUESTED", reason: `Simulovaný požadavek ${reference}; ${method}.`, after: json({ requestId: created.id, amountCents, interval, contract }) } });
    return created;
  }); return requestView(request);
}
export async function verifySimulatedPayment(input: VerifiedSimulationInput, actorId: string): Promise<{ activated: boolean; duplicate: boolean; review: boolean; summary: SubscriptionSummary }> {
  requireSandbox(); await requireAdmin(actorId);
  if (!input.providerEventId?.trim() || input.providerEventId.length > 200 || !Number.isSafeInteger(input.amountCents) || input.amountCents < 0) throw new Error("Neplatná simulovaná událost.");
  const providerEventId = input.providerEventId.trim();
  const result = await serializable(async db => {
    const request = await db.subscriptionPaymentRequest.findUniqueOrThrow({ where: { id: input.requestId }, include: { account: true } });
    const provider = request.method === "BANK" ? "SANDBOX_BANK" : "SANDBOX_GATEWAY";
    const duplicate = await db.subscriptionPaymentEvent.findUnique({ where: { provider_providerEventId: { provider, providerEventId } } });
    if (duplicate) { if (duplicate.requestId !== request.id) throw new Error("Událost již patří jinému platebnímu požadavku."); return { accountId: request.accountId, activated: false, duplicate: true, review: duplicate.result === "REVIEW" }; }
    const reason = input.currency !== request.currency ? "Měna neodpovídá požadavku." : input.amountCents !== request.amountCents ? "Částka neodpovídá požadavku." : input.recipientAccount.trim() !== request.recipientAccount ? "Účet příjemce neodpovídá požadavku." : input.reference !== request.reference ? "Reference neodpovídá požadavku." : input.paymentStatus !== "PAID" ? "Úhrada není potvrzená." : null;
    const alreadyPaid = request.status === "PAID";
    await db.subscriptionPaymentEvent.create({ data: { requestId: request.id, provider, providerEventId: input.providerEventId.trim(), amountCents: input.amountCents, currency: input.currency, recipientAccount: input.recipientAccount, reference: input.reference, paymentStatus: input.paymentStatus, result: reason ? "REVIEW" : alreadyPaid ? "DUPLICATE" : "ACTIVATED", reason } });
    if (reason) { await db.subscriptionAudit.create({ data: { accountId: request.accountId, actorId, action: "PAYMENT_REVIEW", reason, after: json({ requestId: request.id, providerEventId: input.providerEventId }) } }); return { accountId: request.accountId, activated: false, duplicate: false, review: true }; }
    if (alreadyPaid) return { accountId: request.accountId, activated: false, duplicate: true, review: false };
    const now = request.account.simulationNow ?? new Date(); const contract = request.contractSnapshot as unknown as ContractSnapshot;
    // Renewal attaches the old expiry only for the same plan and during its grace period.
    const samePlan = request.account.plan === contract.plan.code;
    let start = samePlan ? renewalStart(request.account.paidUntil, now, contract.graceDays) : now;
    // Advance payment preserves all already granted future access, including trials and gifts.
    for (const benefit of [request.account.paidUntil, request.account.trialUntil, request.account.offerKind === "FREE_UNTIL" ? request.account.offerUntil : null]) if (benefit && benefit > start && benefit > now) start = benefit;
    const paidUntil = addBillingPeriod(start, request.interval as BillingInterval);
    await db.subscriptionPaymentRequest.update({ where: { id: request.id }, data: { status: "PAID", paidAt: now } });
    await db.subscriptionAccount.update({ where: { id: request.accountId }, data: { plan: contract.plan.code, interval: request.interval, contract: json(contract), paidUntil, trialUntil: null } });
    await db.subscriptionAudit.create({ data: { accountId: request.accountId, actorId, action: "PAYMENT_ACTIVATED", reason: `Ověřená simulace ${request.reference}; bez skutečné platby.`, before: json({ paidUntil: iso(request.account.paidUntil) }), after: json({ paidUntil: iso(paidUntil), requestId: request.id, providerEventId: input.providerEventId }) } });
    return { accountId: request.accountId, activated: true, duplicate: false, review: false };
  }).catch(async error => {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const request = await prisma.subscriptionPaymentRequest.findUniqueOrThrow({ where: { id: input.requestId }, select: { method: true, accountId: true } });
    const provider = request.method === "BANK" ? "SANDBOX_BANK" : "SANDBOX_GATEWAY";
    const event = await prisma.subscriptionPaymentEvent.findUnique({ where: { provider_providerEventId: { provider, providerEventId } } });
    if (!event || event.requestId !== input.requestId) throw error;
    return { accountId: request.accountId, activated: false, duplicate: true, review: event.result === "REVIEW" };
  }); return { activated: result.activated, duplicate: result.duplicate, review: result.review, summary: await getSubscriptionSummary(result.accountId) };
}
export type CheckScope = { reactivatingProperty?: boolean; ownerId?: string; propertyId?: string; unitId?: string; additionalUnits?: number; additionalProperties?: number; now?: Date };
async function summariesForScope(user: SubscriptionUserContext, scope: CheckScope, db: Db): Promise<SubscriptionSummary[]> {
  if (scope.unitId || scope.propertyId) {
    const unit = scope.unitId ? await db.unit.findUnique({ where: { id: scope.unitId }, select: { propertyId: true } }) : null;
    const propertyId = scope.propertyId ?? unit?.propertyId;
    if (scope.unitId && (!unit || (scope.propertyId && scope.propertyId !== unit.propertyId))) return [];
    const links = await db.subscriptionScope.findMany({ where: { propertyId, ...(scope.unitId ? { OR: [{ unitId: scope.unitId }, { unitId: null }] } : {}) }, select: { accountId: true } });
    if (links.length) return Promise.all([...new Set(links.map(link => link.accountId))].map(id => getSubscriptionSummary(id, scope.now, db)));
    // Unassigned existing objects remain legacy. Billing enrollment never grants data access.
    return [];
  }
  return (await summaryForUser(user.id, { now: scope.now }, db)).filter(summary => summary.enrolled);
}
export async function checkSubscriptionFeature(user: SubscriptionUserContext, feature: FeatureKey, scope: CheckScope = {}, db: Db = prisma): Promise<SubscriptionDecision> {
  if (user.role === "SUPER_ADMIN" || !isSubscriptionSandbox() || !(await getSubscriptionConfig(db)).enabled) return { allowed: true };
  const summaries = await summariesForScope(user, scope, db); const denied = summaries.filter(summary => !summary.features[feature]);
  return denied.length ? { allowed: false, code: "SUBSCRIPTION_FEATURE", message: "Tato funkce není dostupná v tarifu vybraného portfolia.", accountIds: denied.map(summary => summary.accountId!) } : { allowed: true };
}
export async function checkSubscriptionWrite(user: SubscriptionUserContext, scope: CheckScope = {}, db: Db = prisma): Promise<SubscriptionDecision> {
  if (user.role === "SUPER_ADMIN" || !isSubscriptionSandbox() || !(await getSubscriptionConfig(db)).enabled) return { allowed: true };
  const denied = (await summariesForScope(user, scope, db)).filter(summary => !summary.writable);
  return denied.length ? { allowed: false, code: denied.some(summary => summary.status === "FROZEN") ? "SUBSCRIPTION_FROZEN" : "SUBSCRIPTION_CAPACITY", message: denied[0].reminder ?? "Přístup k práci je pozastaven.", accountIds: denied.map(summary => summary.accountId!) } : { allowed: true };
}
async function capacityTargets(user: SubscriptionUserContext, scope: CheckScope, db: Db): Promise<SubscriptionSummary[]> {
  const selectedOwner = scope.ownerId ? await db.owner.findUnique({ where: { id: scope.ownerId }, select: { userId: true } }) : null;
  if (scope.additionalUnits && scope.propertyId && !scope.unitId) {
    const whole = await db.subscriptionScope.findUnique({ where: { scopeKey: `P:${scope.propertyId}` }, select: { accountId: true } });
    if (whole) return [await getSubscriptionSummary(whole.accountId, scope.now, db)];
    if (scope.ownerId && selectedOwner?.userId !== user.id) return [];
    const own = await db.subscriptionAccount.findFirst({ where: { payerUserId: user.id, kind: "OWN" }, select: { id: true } });
    if (own) return [await getSubscriptionSummary(own.id, scope.now, db)];
    return [];
  }
  if (!scope.propertyId && !scope.unitId && scope.ownerId && selectedOwner?.userId !== user.id) return [];
  if (!scope.propertyId && !scope.unitId) return (await summaryForUser(user.id, { now: scope.now }, db)).filter(summary => summary.enrolled && summary.payerUserId === user.id && summary.kind === "OWN");
  return summariesForScope(user, scope, db);
}
export async function checkSubscriptionCapacity(user: SubscriptionUserContext, scope: CheckScope = {}, db: Db = prisma): Promise<SubscriptionDecision> {
  if (user.role === "SUPER_ADMIN" || !isSubscriptionSandbox() || !(await getSubscriptionConfig(db)).enabled) return { allowed: true };
  const config = await getSubscriptionConfig(db);
  if (scope.additionalUnits && scope.propertyId && scope.ownerId) {
    const whole = await db.subscriptionScope.findUnique({ where: { scopeKey: `P:${scope.propertyId}` }, include: { account: { select: { kind: true, payerUserId: true, payer: { select: { flatcloudMember: true } } } } } });
    const owner = await db.owner.findUnique({ where: { id: scope.ownerId }, select: { userId: true, affiliation: true } });
    if (whole?.account.kind === "OWN" && whole.account.payer.flatcloudMember && owner?.userId !== whole.account.payerUserId) return { allowed: false, code: "SUBSCRIPTION_SCOPE", message: "Externí jednotka potřebuje samostatné klientské předplatné. Nelze ji přidat do osvobozeného vlastního portfolia týmu." };
    if (whole?.account.kind === "INTERNAL" && whole.account.payer.flatcloudMember && !["FLATCLOUD_PARENT", "FLATCLOUD_GROUP"].includes(owner?.affiliation ?? "")) return { allowed: false, code: "SUBSCRIPTION_SCOPE", message: "Externí jednotka potřebuje samostatné klientské předplatné." };
  }
  const summaries = await capacityTargets(user, scope, db);
  if (scope.additionalUnits && scope.propertyId && !summaries.length && await db.subscriptionScope.count({ where: { propertyId: scope.propertyId } })) return { allowed: false, code: "SUBSCRIPTION_CAPACITY", message: "U smíšeného portfolia musí být pro novou jednotku určený plátce předplatného." };
  const reactivationUnits = new Map<string, number>();
  if (scope.reactivatingProperty && scope.propertyId) {
    const property = await db.property.findUnique({ where: { id: scope.propertyId }, select: { active: true, units: { select: { id: true, status: true, operationalStatus: true } } } });
    if (property && !property.active) for (const summary of summaries) {
      const links = summary.scopes.filter(link => link.propertyId === scope.propertyId);
      const covered = property.units.filter(unit => activeUnit(unit) && links.some(link => !link.unitId || link.unitId === unit.id));
      reactivationUnits.set(summary.accountId!, covered.length);
    }
  }
  const denied = summaries.filter(summary => {
    const capacity = summary.effectiveCapacityUnits;
    const maxProperties = summary.effectiveMaxProperties;
    let additionalUnits = scope.additionalUnits ?? 0;
    let additionalProperties = (scope.additionalProperties ?? 0) + (scope.additionalUnits && scope.propertyId && !summary.scopes.some(link => link.propertyId === scope.propertyId) ? 1 : 0);
    if (scope.reactivatingProperty && scope.propertyId) {
      const links = summary.scopes.filter(link => link.propertyId === scope.propertyId);
      // Each summary only counts its own assigned units in a mixed-ownership object.
      additionalUnits = reactivationUnits.get(summary.accountId!) ?? 0;
      additionalProperties = links.length ? 1 : 0;
    }
    return summary.usage.units + additionalUnits > capacity || (maxProperties !== null && summary.usage.properties + additionalProperties > maxProperties);
  });
  return denied.length ? { allowed: false, code: "SUBSCRIPTION_CAPACITY", message: "Přidání překračuje kapacitu předplatného. Upravte tarif nebo zakoupenou kapacitu.", accountIds: denied.map(summary => summary.accountId!) } : { allowed: true };
}
/** Call inside the existing serializable create transaction before counting/writing. */
export async function lockSubscriptionAccounts(user: SubscriptionUserContext, scope: CheckScope, db: Db): Promise<string[]> {
  const summaries = await capacityTargets(user, scope, db); const ids = summaries.map(s => s.accountId).filter((id): id is string => Boolean(id)).sort();
  for (const id of ids) await db.$queryRaw`SELECT "id" FROM "SubscriptionAccount" WHERE "id" = ${id} FOR UPDATE`;
  return ids;
}
/** New self-owned objects are assigned to the payer's own enrolled account only. */
export async function attachCreatedProperty(user: SubscriptionUserContext, propertyId: string, db: Db): Promise<void> {
  if (!isSubscriptionSandbox() || !(await getSubscriptionConfig(db)).enabled) return;
  const account = await db.subscriptionAccount.findFirst({ where: { payerUserId: user.id, kind: "OWN" }, orderBy: { createdAt: "asc" } });
  const property = await db.property.findUnique({ where: { id: propertyId }, select: { owner: { select: { userId: true } } } });
  if (account && property?.owner.userId === user.id) await db.subscriptionScope.create({ data: { accountId: account.id, propertyId, scopeKey: `P:${propertyId}` } });
}
/** Whole-property coverage already includes new units; a unit-only scope needs explicit payer coverage. */
export async function attachCreatedUnit(user: SubscriptionUserContext, propertyId: string, unitId: string, db: Db): Promise<void> {
  if (!isSubscriptionSandbox() || !(await getSubscriptionConfig(db)).enabled || await db.subscriptionScope.findUnique({ where: { scopeKey: `P:${propertyId}` } })) return;
  const account = await db.subscriptionAccount.findFirst({ where: { payerUserId: user.id, kind: "OWN" }, orderBy: { createdAt: "asc" } });
  const unit = await db.unit.findUnique({ where: { id: unitId }, select: { ownerships: { select: { owner: { select: { userId: true } } } }, property: { select: { owner: { select: { userId: true } } } } } });
  const selfOwned = unit && (unit.ownerships.length ? unit.ownerships.some(row => row.owner.userId === user.id) : unit.property.owner.userId === user.id);
  if (account && selfOwned) { await validateScopes([{ propertyId, unitId }], account.id, db); await db.subscriptionScope.create({ data: { accountId: account.id, propertyId, unitId, scopeKey: `U:${unitId}` } }); }
}

/** Registration-only helper, inside the caller's existing transaction. No legacy data is assigned. */
export async function ensureFreeSubscriptionAccount(db: Db, userId: string, ownerId: string | null = null): Promise<string | null> {
  if (!subscriptionsSandboxEnabled()) return null;
  const existing = await db.subscriptionAccount.findFirst({ where: { payerUserId: userId, kind: "OWN" } });
  if (existing) return existing.id;
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, email: true } });
  const config = await getSubscriptionConfig(db);
  const account = await db.subscriptionAccount.create({ data: { payerUserId: userId, ownerId, kind: "OWN", billingName: user.name, billingEmail: user.email, plan: "FREE", interval: "MONTHLY", contract: json(makeContract(config, "FREE", config.plans.FREE.includedUnits)) } });
  await db.subscriptionAudit.create({ data: { accountId: account.id, actorId: userId, action: "SELF_REGISTERED_FREE", reason: "Vlastní bezplatné portfolio založené při registraci; bez změny stávajících oprávnění." } });
  return account.id;
}

/** Bulk management view avoids one account/config query pair per table row. */
export async function adminSubscriptionSummaries(actorId: string): Promise<SubscriptionSummary[]> {
  if (!subscriptionsSandboxEnabled()) return [];
  await requireAdmin(actorId);
  const [accounts, config] = await Promise.all([prisma.subscriptionAccount.findMany({ include: accountInclude, orderBy: { createdAt: "asc" } }), getSubscriptionConfig()]);
  return accounts.map(account => summaryOf(account, config));
}
