import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { calculateSecurityDepositSnapshot } from "../lib/security-deposit-core";
import { securityDepositStatuses } from "../lib/labels";
import { portfolioPropertyStatus } from "../lib/portfolio-property-status";
import { calculatePropertySnapshot } from "../lib/reporting/snapshot-calculator";

const depositLease = (securityDepositTerms: Array<{ agreedAmountCents: number; annualRateBps: number; effectiveFrom: Date }> = []) => ({
  id: "lease-deposit",
  unitId: "unit-deposit",
  startDate: new Date("2026-01-01T12:00:00Z"),
  endDate: null,
  terminatedOn: null,
  cancelledAt: null,
  status: "ACTIVE",
  financialTrackingFromPeriod: "2026-01",
  rentCents: 10_000,
  servicesCents: 0,
  depositCents: 0,
  paymentItems: [{ active: true, validFrom: new Date("2026-01-01T12:00:00Z"), validTo: null, category: "RENT", amountCents: 10_000 }],
  charges: [],
  securityDepositTerms,
  securityDepositMovements: [],
});

const depositQuality = (lease: ReturnType<typeof depositLease>) => calculatePropertySnapshot({
  propertyId: "property-deposit",
  asOf: new Date("2026-09-03T12:00:00Z"),
  units: [{ id: "unit-deposit", areaM2: 50, operationalStatusEvents: [{ status: "STANDARD", effectiveAt: new Date("2026-01-01T12:00:00Z") }], leases: [lease] }],
}).quality.issues.filter((issue) => issue.code === "DEPOSIT_CONFIGURATION_WARNING");

const checks: Array<[string, () => void | Promise<void>]> = [
  ["portfolio distinguishes waiting from unfinished setup", () => {
    assert.deepEqual(portfolioPropertyStatus({ archived: false, expectedCents: 10_000, paidCents: 0, overdueDebtCents: 0 }), { label: "Čeká na úhradu", tone: "warn" });
    assert.deepEqual(portfolioPropertyStatus({ archived: false, expectedCents: 10_000, paidCents: 4_000, overdueDebtCents: 0 }), { label: "Částečně uhrazeno", tone: "warn" });
    assert.deepEqual(portfolioPropertyStatus({ archived: false, expectedCents: 10_000, paidCents: 10_000, overdueDebtCents: 0 }), { label: "V pořádku", tone: "ok" });
    assert.deepEqual(portfolioPropertyStatus({ archived: false, expectedCents: 10_000, paidCents: 0, overdueDebtCents: 10_000 }), { label: "Vyžaduje pozornost", tone: "bad" });
    assert.deepEqual(portfolioPropertyStatus({ archived: false, expectedCents: 0, paidCents: 0, overdueDebtCents: 0 }), { label: "Bez předpisu", tone: "neutral" });
  }],
  ["zero agreed deposit is not reported as unpaid", () => {
    const explicitZero = calculateSecurityDepositSnapshot({ depositCents: 0, terms: [{ agreedAmountCents: 0, annualRateBps: 0, effectiveFrom: new Date("2026-01-01T12:00:00Z") }], asOf: new Date("2026-09-02T12:00:00Z") });
    const positiveUnpaid = calculateSecurityDepositSnapshot({ depositCents: 10_000, asOf: new Date("2026-09-02T12:00:00Z") });
    assert.equal(explicitZero.status, "NOT_CONFIGURED");
    assert.equal(securityDepositStatuses[explicitZero.status], "Nesjednána");
    assert.equal(positiveUnpaid.status, "UNPAID");
    assert.equal(securityDepositStatuses[positiveUnpaid.status], "Nesložena");
  }],
  ["explicitly agreed zero deposit is not a data consistency warning", () => {
    const explicitZero = depositLease([{ agreedAmountCents: 0, annualRateBps: 0, effectiveFrom: new Date("2026-01-01T12:00:00Z") }]);
    assert.equal(depositQuality(explicitZero).length, 0);
    assert.equal(depositQuality(depositLease()).length, 1);
  }],
  ["portfolio renders communication owner and no legacy work-in-progress label", async () => {
    const source = await readFile(new URL("../app/portfolio/page.tsx", import.meta.url), "utf8");
    assert.match(source, /property\.communicationOwner\?\.name\|\|property\.owner\.name/);
    assert.match(source, /Komunikační vlastník \/ SVJ/);
    assert.doesNotMatch(source, /Rozpracováno/);
  }],
  ["live reports translate lease and deposit states", async () => {
    const source = await readFile(new URL("../app/reporty/page.tsx", import.meta.url), "utf8");
    assert.match(source, /leaseStatuses\[row\.leaseStatus\]/);
    assert.match(source, /securityDepositStatuses\[row\.depositStatus\]/);
    assert.match(source, /className="deposit-kpis"/);
    assert.match(source, /Sjednané kauce/);
  }],
  ["report scope selector stays below the sticky application header", async () => {
    const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
    assert.match(styles, /\.scope-picker\{z-index:10\}/);
    assert.match(styles, /\.deposit-kpis\{grid-template-columns:repeat\(4/);
  }],
];

async function main() {
  let failures = 0;
  for (const [name, check] of checks) {
    try { await check(); console.log(`PASS ${name}`); }
    catch (error) { failures += 1; console.error(`FAIL ${name}`, error); }
  }
  if (failures) process.exit(1);
}

main().catch((error) => { console.error(error); process.exit(1); });
