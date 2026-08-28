import { readFileSync } from "node:fs";
import { calculateSecurityDepositSnapshot, validateSecurityDepositTimeline } from "../lib/security-deposit-core";
import { securityDepositSnapshot } from "../lib/security-deposit";

const movementDate = new Date("2026-08-28T12:00:00.000Z");
const lease = (movements: Parameters<typeof calculateSecurityDepositSnapshot>[0]["movements"] = [], terms: Parameters<typeof calculateSecurityDepositSnapshot>[0]["terms"] = [], lifecycle: { endDate?: Date | null; terminatedOn?: Date | null } = {}) => ({
  depositCents: 1_000_000,
  endDate: lifecycle.endDate ?? null,
  terminatedOn: lifecycle.terminatedOn,
  securityDepositTerms: terms,
  securityDepositMovements: movements,
});
const received = { type: "RECEIVED" as const, amountCents: 1_000_000, effectiveAt: movementDate };
const checks: Array<[string, boolean]> = [];

const sameDay = securityDepositSnapshot(lease([received]), new Date("2026-08-28T08:00:00.000Z"));
checks.push(["same-day RECEIVED is funded before DB anchor time", sameDay.heldPrincipalCents === 1_000_000 && sameDay.missingDepositCents === 0 && sameDay.status === "FUNDED"]);

const previousDay = securityDepositSnapshot(lease([received]), new Date("2026-08-27T20:00:00.000Z"));
checks.push(["previous-day snapshot excludes RECEIVED", previousDay.heldPrincipalCents === 0 && previousDay.status === "UNPAID"]);

const returned = securityDepositSnapshot(lease([received, { type: "RETURNED", amountCents: 200_000, effectiveAt: movementDate }]), new Date("2026-08-28T08:00:00.000Z"));
checks.push(["same-day RETURNED reduces principal", returned.heldPrincipalCents === 800_000 && returned.status === "PARTIAL"]);

const offset = securityDepositSnapshot(lease([received, { type: "OFFSET", amountCents: 300_000, effectiveAt: movementDate }]), new Date("2026-08-28T08:00:00.000Z"));
checks.push(["same-day OFFSET reduces principal", offset.heldPrincipalCents === 700_000]);

const term = securityDepositSnapshot(lease([], [{ agreedAmountCents: 1_000_000, annualRateBps: 500, effectiveFrom: movementDate }]), new Date("2026-08-28T08:00:00.000Z"));
checks.push(["same-day term sets annual rate", term.currentAnnualRateBps === 500]);

const afterPragueMidnight = securityDepositSnapshot(lease([received]), new Date("2026-08-27T22:30:00.000Z"));
checks.push(["Prague calendar day is used around UTC midnight", afterPragueMidnight.heldPrincipalCents === 1_000_000 && afterPragueMidnight.status === "FUNDED"]);

const endDate = new Date("2026-08-28T12:00:00.000Z");
const onEndDate = securityDepositSnapshot(lease([received], [], { endDate }), new Date("2026-08-28T08:00:00.000Z"));
const afterEndDate = securityDepositSnapshot(lease([received], [], { endDate }), new Date("2026-08-29T08:00:00.000Z"));
checks.push(["lease stays FUNDED through endDate and settles next day", onEndDate.status === "FUNDED" && afterEndDate.status === "TO_SETTLE"]);

const laterEndDate = new Date("2026-08-30T12:00:00.000Z");
const terminatedOn = new Date("2026-08-28T12:00:00.000Z");
const onTerminationDate = securityDepositSnapshot(lease([received], [], { endDate: laterEndDate, terminatedOn }), new Date("2026-08-28T08:00:00.000Z"));
const afterTerminationDate = securityDepositSnapshot(lease([received], [], { endDate: laterEndDate, terminatedOn }), new Date("2026-08-29T08:00:00.000Z"));
checks.push(["earlier terminatedOn stays active all day and settles next day", onTerminationDate.status === "FUNDED" && afterTerminationDate.status === "TO_SETTLE"]);

let exactTimestampValidationRejected = false;
try {
  validateSecurityDepositTimeline({
    depositCents: 1_000_000,
    movements: [
      { type: "RECEIVED", amountCents: 1_000_000, effectiveAt: new Date("2026-08-28T12:00:00.000Z") },
      { type: "RETURNED", amountCents: 100_000, effectiveAt: new Date("2026-08-28T11:00:00.000Z") },
    ],
  });
} catch {
  exactTimestampValidationRejected = true;
}
checks.push(["core validation preserves exact timestamp ordering", exactTimestampValidationRejected]);

const leaseDetail = readFileSync("app/smlouvy/[leaseId]/page.tsx", "utf8");
const depositReport = readFileSync("app/kauce/page.tsx", "utf8");
checks.push(["both UI callers use shared snapshot", leaseDetail.includes("securityDepositSnapshot(lease)") && depositReport.includes("securityDepositSnapshot(lease)") && !leaseDetail.includes("calculateSecurityDepositSnapshot") && !depositReport.includes("calculateSecurityDepositSnapshot")]);

const ci = readFileSync(".github/workflows/ci.yml", "utf8");
checks.push(["CI runs V21.6.1 verification", ci.includes("npm run verify:v21.6.1")]);

const failures = checks.filter(([, passed]) => !passed);
if (failures.length) throw new Error(failures.map(([name]) => `FAIL: ${name}`).join("\n"));
console.log(`V21.6.1 verification passed (${checks.length} checks).`);
