export type SecurityDepositMovementType =
  | "RECEIVED"
  | "RETURNED"
  | "OFFSET"
  | "ADJUSTMENT_INCREASE"
  | "ADJUSTMENT_DECREASE"
  | "INTEREST_PAID"
  | "INTEREST_ADJUSTMENT_INCREASE"
  | "INTEREST_ADJUSTMENT_DECREASE";

export type DepositTerm = {
  agreedAmountCents: number;
  annualRateBps: number;
  effectiveFrom: Date;
  createdAt?: Date;
};

export type DepositMovement = {
  type: SecurityDepositMovementType;
  amountCents: number;
  effectiveAt: Date;
};

export type SecurityDepositSnapshot = {
  agreedAmountCents: number;
  heldPrincipalCents: number;
  receivedCents: number;
  returnedCents: number;
  offsetCents: number;
  principalAdjustmentsCents: number;
  currentAnnualRateBps: number;
  accruedInterestCents: number;
  interestPaidCents: number;
  interestAdjustmentsCents: number;
  interestDueCents: number;
  amountToReturnCents: number;
  missingDepositCents: number;
  excessDepositCents: number;
  hasLedger: boolean;
  status: "NOT_CONFIGURED" | "UNPAID" | "PARTIAL" | "FUNDED" | "TO_SETTLE" | "SETTLED";
};

const principalIncrease = new Set<SecurityDepositMovementType>(["RECEIVED", "ADJUSTMENT_INCREASE"]);
const principalDecrease = new Set<SecurityDepositMovementType>(["RETURNED", "OFFSET", "ADJUSTMENT_DECREASE"]);
const interestIncrease = new Set<SecurityDepositMovementType>(["INTEREST_ADJUSTMENT_INCREASE"]);
const interestDecrease = new Set<SecurityDepositMovementType>(["INTEREST_ADJUSTMENT_DECREASE"]);
const DAY_MS = 86_400_000;

function roundDiv(numerator: bigint, denominator: bigint) {
  if (numerator <= BigInt(0)) return 0;
  return Number((numerator + denominator / BigInt(2)) / denominator);
}

function daysBetween(from: Date, to: Date) {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY_MS));
}

export function calculateSecurityDepositSnapshot(input: {
  depositCents: number;
  leaseEnded?: boolean;
  asOf?: Date;
  terms?: DepositTerm[];
  movements?: DepositMovement[];
}): SecurityDepositSnapshot {
  const asOf = input.asOf || new Date();
  const terms = [...(input.terms || [])].filter((term) => term.effectiveFrom <= asOf).sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime() || (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0));
  const movements = [...(input.movements || [])].filter((movement) => movement.effectiveAt <= asOf).sort((a, b) => a.effectiveAt.getTime() - b.effectiveAt.getTime());
  const agreedAmountCents = terms.at(-1)?.agreedAmountCents ?? input.depositCents;
  const events = [...new Set([...terms.map((term) => term.effectiveFrom.getTime()), ...movements.map((movement) => movement.effectiveAt.getTime()), asOf.getTime()])].sort((a, b) => a - b);
  let principal = 0;
  let accruedInterestCents = 0;
  let interestPaidCents = 0;
  let interestAdjustmentsCents = 0;
  let termIndex = -1;
  let movementIndex = 0;
  let rateBps = 0;
  for (let index = 0; index < events.length; index += 1) {
    const start = new Date(events[index]);
    const end = new Date(events[index + 1] || asOf.getTime());
    while (termIndex + 1 < terms.length && terms[termIndex + 1].effectiveFrom <= start) {
      termIndex += 1;
      rateBps = terms[termIndex].annualRateBps;
    }
    while (movementIndex < movements.length && movements[movementIndex].effectiveAt.getTime() === start.getTime()) {
      const movement = movements[movementIndex];
      if (principalIncrease.has(movement.type)) principal += movement.amountCents;
      if (principalDecrease.has(movement.type)) principal -= movement.amountCents;
      if (movement.type === "INTEREST_PAID") interestPaidCents += movement.amountCents;
      if (interestIncrease.has(movement.type)) interestAdjustmentsCents += movement.amountCents;
      if (interestDecrease.has(movement.type)) interestAdjustmentsCents -= movement.amountCents;
      if (principal < 0) throw new Error("Pohyb kauce by vytvořil zápornou drženou jistinu.");
      movementIndex += 1;
    }
    if (end > start && principal > 0 && rateBps > 0) accruedInterestCents += roundDiv(BigInt(principal) * BigInt(rateBps) * BigInt(daysBetween(start, end)), BigInt(365 * 10000));
  }
  const receivedCents = movements.filter((movement) => movement.type === "RECEIVED").reduce((sum, movement) => sum + movement.amountCents, 0);
  const returnedCents = movements.filter((movement) => movement.type === "RETURNED").reduce((sum, movement) => sum + movement.amountCents, 0);
  const offsetCents = movements.filter((movement) => movement.type === "OFFSET").reduce((sum, movement) => sum + movement.amountCents, 0);
  const principalAdjustmentsCents = movements.filter((movement) => movement.type === "ADJUSTMENT_INCREASE" || movement.type === "ADJUSTMENT_DECREASE").reduce((sum, movement) => sum + (movement.type === "ADJUSTMENT_INCREASE" ? movement.amountCents : -movement.amountCents), 0);
  const interestDueCents = Math.max(0, accruedInterestCents + interestAdjustmentsCents - interestPaidCents);
  const status = !terms.length && agreedAmountCents === 0 ? "NOT_CONFIGURED" : input.leaseEnded && (principal > 0 || interestDueCents > 0) ? "TO_SETTLE" : principal === 0 && interestDueCents === 0 && movements.length > 0 ? "SETTLED" : principal === 0 ? "UNPAID" : principal < agreedAmountCents ? "PARTIAL" : "FUNDED";
  return { agreedAmountCents, heldPrincipalCents: principal, receivedCents, returnedCents, offsetCents, principalAdjustmentsCents, currentAnnualRateBps: rateBps, accruedInterestCents, interestPaidCents, interestAdjustmentsCents, interestDueCents, amountToReturnCents: principal + interestDueCents, missingDepositCents: Math.max(0, agreedAmountCents - principal), excessDepositCents: Math.max(0, principal - agreedAmountCents), hasLedger: movements.length > 0, status };
}

export function ratePercentToBps(value: string | number) {
  const parsed = typeof value === "number" ? value : Number(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) throw new Error("Úrok kauce musí být mezi 0 a 100 %.");
  return Math.round(parsed * 100);
}
