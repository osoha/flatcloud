import { calculateSecurityDepositSnapshot } from "../security-deposit-core";
import { businessDateEndInstant, businessDateKey } from "../calendar";
type DepositInput = { depositCents: number; securityDepositTerms: NonNullable<Parameters<typeof calculateSecurityDepositSnapshot>[0]["terms"]>; securityDepositMovements: NonNullable<Parameters<typeof calculateSecurityDepositSnapshot>[0]["movements"]> };
/** Only dated ledger movements establish held cash; missing history stays a gap. */
export function depositHistoryRows(leases: DepositInput[], periods: string[], asOf: Date) {
  const first = leases.flatMap(lease => lease.securityDepositMovements).reduce<Date | null>((earliest, movement) => !earliest || movement.effectiveAt < earliest ? movement.effectiveAt : earliest, null);
  return periods.map(period => {
    const [year, month] = period.split("-").map(Number);
    const end = new Date(Date.UTC(year, month, 0, 12));
    const dateKey = businessDateKey(end) < businessDateKey(asOf) ? businessDateKey(end) : businessDateKey(asOf);
    const cutoff = businessDateEndInstant(dateKey);
    const value = !first || first > cutoff || period > businessDateKey(asOf).slice(0, 7) ? null : leases.reduce((sum, lease) => sum + calculateSecurityDepositSnapshot({ depositCents: lease.depositCents, terms: lease.securityDepositTerms, movements: lease.securityDepositMovements, asOf: cutoff }).heldPrincipalCents, 0);
    return { label: period, values: [value] };
  });
}
