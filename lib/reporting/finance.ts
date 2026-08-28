import { businessDateKey } from "../calendar";
type Allocation = { amountCents: number; transaction: { bookedAt: Date } };
type Offset = { amountCents: number; effectiveAt: Date };
type Credit = { amountCents: number; effectiveAt: Date };
type HistoricalCharge = { active: boolean; amountCents: number; dueDate: Date; allocations: Allocation[]; securityDepositOffsets?: Offset[]; creditApplications?: Credit[] };
export function paymentAllocationEffectiveAt(allocation: Allocation) { return allocation.transaction.bookedAt; }
const included = (date: Date, asOf: Date) => businessDateKey(date) <= businessDateKey(asOf);
export function paidCentsAsOf(charge: Pick<HistoricalCharge, "allocations" | "securityDepositOffsets" | "creditApplications">, asOf: Date) {
  return charge.allocations.filter((a) => included(paymentAllocationEffectiveAt(a), asOf)).reduce((s, a) => s + a.amountCents, 0)
    + (charge.securityDepositOffsets || []).filter((a) => included(a.effectiveAt, asOf)).reduce((s, a) => s + a.amountCents, 0)
    + (charge.creditApplications || []).filter((a) => included(a.effectiveAt, asOf)).reduce((s, a) => s + a.amountCents, 0);
}
export function outstandingCentsAsOf(charge: HistoricalCharge, asOf: Date) { return Math.max(0, charge.amountCents - paidCentsAsOf(charge, asOf)); }
export function overdueDebtCentsAsOf(charge: HistoricalCharge, asOf: Date) { return charge.active && businessDateKey(charge.dueDate) < businessDateKey(asOf) ? outstandingCentsAsOf(charge, asOf) : 0; }
