type FinancialKpis = {
  annualRentCents: number; outstandingPrincipalCents: number; equityCents: number | null;
  noiCents: number | null; cashflowCents: number | null; yieldBps: number | null;
  roeBps: number | null; ltvBps: number | null; dscrBps: number | null;
};
/** A partial subtotal must never masquerade as a complete return indicator. */
export function guardKpiInputs<T extends FinancialKpis>(metrics: T, rentComplete: boolean, principalComplete: boolean) {
  return {
    ...metrics, rentComplete, principalComplete,
    annualRentCents: rentComplete ? metrics.annualRentCents : null,
    outstandingPrincipalCents: principalComplete ? metrics.outstandingPrincipalCents : null,
    equityCents: principalComplete ? metrics.equityCents : null,
    noiCents: rentComplete ? metrics.noiCents : null,
    yieldBps: rentComplete ? metrics.yieldBps : null,
    ltvBps: principalComplete ? metrics.ltvBps : null,
    cashflowCents: rentComplete && principalComplete ? metrics.cashflowCents : null,
    roeBps: rentComplete && principalComplete ? metrics.roeBps : null,
    dscrBps: rentComplete && principalComplete ? metrics.dscrBps : null,
  };
}
