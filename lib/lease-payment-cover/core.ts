import { businessDateKey } from "../calendar";

const serviceCategories = new Set(["SERVICES", "WATER", "HEATING", "ELECTRICITY"]);
export type PaymentCoverItem = { name: string; category: string; amountCents: number; active: boolean; validFrom: Date; validTo: Date | null; sortOrder: number };
export type PaymentCoverVersion = { key: string; effectiveFrom: string; current: boolean; source: "VERSIONS" | "CURRENT"; items: Array<{ name: string; amountCents: number; kind: "RENT" | "SERVICES" }>; rentCents: number; servicesCents: number; totalCents: number };
type LeaseState = { startDate: Date; endDate: Date | null; terminatedOn: Date | null; cancelledAt: Date | null; rentCents: number; servicesCents: number; paymentItems: PaymentCoverItem[] };
const isRentOrService = (item: PaymentCoverItem) => item.category === "RENT" || serviceCategories.has(item.category);
const dayAfter = (key: string) => new Date(new Date(`${key}T12:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10);

/** Read-only projection of saved recurring versions, never of editable preview inputs or charge overrides. */
export function paymentCoverVersions(lease: LeaseState, now = new Date()): PaymentCoverVersion[] {
  if (lease.cancelledAt) return [];
  const today = businessDateKey(now), start = businessDateKey(lease.startDate);
  const ends = [lease.endDate, lease.terminatedOn].filter((d): d is Date => Boolean(d)).map(businessDateKey).sort();
  const end = ends[0];
  if (end && end < today) return [];
  const items = lease.paymentItems.filter(item => item.active && isRentOrService(item));
  // Pure legacy records have only the current stored amounts; never project them into future versions.
  if (!lease.paymentItems.some(isRentOrService)) {
    if (start > today || ![lease.rentCents, lease.servicesCents].every(n => Number.isSafeInteger(n) && n >= 0) || !Number.isSafeInteger(lease.rentCents + lease.servicesCents)) return [];
    return [{ key: "current", effectiveFrom: today, current: true, source: "CURRENT", rentCents: lease.rentCents, servicesCents: lease.servicesCents, totalCents: lease.rentCents + lease.servicesCents,
      items: [{ name: "Nájemné", amountCents: lease.rentCents, kind: "RENT" }, { name: "Zálohy na služby", amountCents: lease.servicesCents, kind: "SERVICES" }] }];
  }
  const boundaries = new Set<string>([start]);
  for (const item of items) { boundaries.add(businessDateKey(item.validFrom)); if (item.validTo) boundaries.add(dayAfter(businessDateKey(item.validTo))); }
  const currentBoundary = [...boundaries].filter(key => key <= today && key >= start).sort().at(-1);
  const selected = [...new Set([...(currentBoundary ? [currentBoundary] : []), ...[...boundaries].filter(key => key > today && key >= start)])].filter(key => !end || key <= end).sort();
  return selected.flatMap(effectiveFrom => {
    const atDate = items.filter(item => businessDateKey(item.validFrom) <= effectiveFrom && (!item.validTo || businessDateKey(item.validTo) >= effectiveFrom));
    const resolve = (kind: "RENT" | "SERVICES", storedAmount: number) => {
      const relevant = (item: PaymentCoverItem) => kind === "RENT" ? item.category === "RENT" : serviceCategories.has(item.category);
      const matching = atDate.filter(relevant);
      if (matching.length) return matching;
      // An ended saved version explicitly stops this recurring component. Otherwise a missing
      // non-zero component is ambiguous, so do not issue a misleading payment instruction.
      const endedVersion = items.some(item => relevant(item) && item.validTo && businessDateKey(item.validTo) < effectiveFrom);
      return storedAmount === 0 || endedVersion ? [] : null;
    };
    const rent = resolve("RENT", lease.rentCents), services = resolve("SERVICES", lease.servicesCents);
    if (!rent || !services) return [];
    const included = [...rent, ...services].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "cs"));
    if (included.some(item => !Number.isSafeInteger(item.amountCents) || item.amountCents < 0)) return [];
    const rentCents = rent.reduce((sum, item) => sum + item.amountCents, 0), servicesCents = services.reduce((sum, item) => sum + item.amountCents, 0);
    if (!Number.isSafeInteger(rentCents + servicesCents)) return [];
    const current = effectiveFrom <= today;
    return [{ key: effectiveFrom, effectiveFrom, current, source: "VERSIONS" as const, rentCents, servicesCents, totalCents: rentCents + servicesCents,
      items: included.map(item => ({ name: item.name, amountCents: item.amountCents, kind: item.category === "RENT" ? "RENT" as const : "SERVICES" as const })) }];
  });
}

export function paymentCoverMoney(amountCents: number, currency: string) {
  return new Intl.NumberFormat("cs-CZ", { style: "currency", currency, minimumFractionDigits: amountCents % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(amountCents / 100);
}

export function paymentCoverDisposition(name: string, effectiveFrom: string) {
  const part = name.normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || "smlouva";
  return `attachment; filename="Platebni-list-${effectiveFrom}-${part}.pdf"`;
}
