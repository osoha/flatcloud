import type { LeaseCredit } from "@prisma/client";

export type CreditApplicationLike = { amountCents: number };
export type LeaseCreditLike = Pick<LeaseCredit, "amountCents"> & { applications?: CreditApplicationLike[] };

export function remainingCreditCents(credit: LeaseCreditLike) {
  return Math.max(0, credit.amountCents - (credit.applications || []).reduce((sum, application) => sum + application.amountCents, 0));
}
