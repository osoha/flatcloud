import { businessDateKey, businessMonthKey } from "../calendar";

type AmountSource = "CHARGE_ITEM" | "PAYMENT_ITEM" | "LEGACY";
type RentRollLease = { rentCents: number; servicesCents: number; charges?: Array<{ active: boolean; period: string; items?: Array<{ category: string; amountCents: number }> }>; paymentItems?: Array<{ active: boolean; validFrom: Date; validTo?: Date | null; category: string; amountCents: number }> };
function componentAmount(items: Array<{ category: string; amountCents: number }> | undefined, category: string) { const matching = (items || []).filter((item) => item.category === category); return matching.length ? matching.reduce((sum, item) => sum + item.amountCents, 0) : null; }

/** Resolves RENT and SERVICES independently so one component never suppresses another component's fallback. */
export function rentRollAmountsAt(lease: RentRollLease, asOf: Date) {
  const asOfKey = businessDateKey(asOf);
  const charge = lease.charges?.find((candidate) => candidate.active && candidate.period === businessMonthKey(asOf));
  const paymentItems = lease.paymentItems?.filter((item) => item.active && businessDateKey(item.validFrom) <= asOfKey && (!item.validTo || businessDateKey(item.validTo) >= asOfKey));
  const resolve = (category: "RENT" | "SERVICES", legacy: number, legacyZeroIsKnown: boolean): { amountCents: number; source: AmountSource | null } => {
    const chargeAmount = componentAmount(charge?.items, category); if (chargeAmount !== null) return { amountCents: chargeAmount, source: "CHARGE_ITEM" };
    const paymentAmount = componentAmount(paymentItems, category); if (paymentAmount !== null) return { amountCents: paymentAmount, source: "PAYMENT_ITEM" };
    return legacy !== 0 || legacyZeroIsKnown ? { amountCents: legacy, source: "LEGACY" } : { amountCents: 0, source: null };
  };
  return { chargeFound: Boolean(charge), rent: resolve("RENT", lease.rentCents, false), services: resolve("SERVICES", lease.servicesCents, true) };
}
