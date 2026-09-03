import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { calculateSecurityDepositSnapshot } from "../lib/security-deposit-core";
import { securityDepositStatuses } from "../lib/labels";
import { portfolioPropertyStatus } from "../lib/portfolio-property-status";

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
