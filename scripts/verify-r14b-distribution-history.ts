import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { prisma } from "../lib/db";
import { createDistributionOpportunity, createDistributionProspect, updateDistributionOpportunity } from "../lib/distribution/crm";
import { loadDistributionReport, parseDistributionReportPeriod } from "../lib/distribution/reporting";

const read = (path: string) => readFileSync(path, "utf8");
let passed = 0;
async function check(name: string, run: () => void | Promise<void>) { await run(); passed += 1; console.log(`✓ ${name}`); }

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: "SUPER_ADMIN", active: true }, select: { id: true, role: true, allProperties: true } });
  assert.ok(admin);
  const marker = `r14b-${Date.now()}`;
  const owner = await prisma.owner.create({ data: { name: `${marker}-owner`, affiliation: "FLATCLOUD_GROUP" } });
  const property = await prisma.property.create({ data: { name: `${marker}-property`, address: "History 1", city: "Praha", ownerId: owner.id, flatcloudConsolidationBasisPoints: 10_000, units: { create: { label: "R14B-1" } } }, include: { units: true } });
  const prospect = await createDistributionProspect(admin, { name: `${marker}-buyer`, email: `${marker}@example.test` });
  let opportunityId = "";
  try {
    await check("period report aggregates immutable stage and option events without PII", async () => {
      const opportunity = await createDistributionOpportunity(admin, { prospectId: prospect.id, unitId: property.units[0].id, stage: "NEW", askingPriceCents: 5_000_000_00, offeredPriceCents: null, nextActionAt: null, optionStatus: "NONE" });
      opportunityId = opportunity.id;
      await updateDistributionOpportunity(admin, opportunity.id, { stage: "CONTACTED", askingPriceCents: 5_000_000_00, offeredPriceCents: 4_900_000_00, nextActionAt: null, optionStatus: "SIGNED", optionExpiresAt: new Date(Date.now() + 30 * 86_400_000), optionPriceCents: 150_000_00, optionReference: "OPCE-R14B" });
      const report = await loadDistributionReport(admin, parseDistributionReportPeriod(undefined).key);
      const row = report.rows.find((item) => item.propertyId === property.id);
      assert.ok(row);
      assert.equal(row.funnelEventCount, 2);
      assert.equal(row.stageActivityCounts.NEW, 1);
      assert.equal(row.stageActivityCounts.CONTACTED, 1);
      assert.equal(row.signedOptionCount, 1);
      assert.equal(JSON.stringify(row).includes(prospect.email || ""), false);
    });
    await check("R14B remains read-only and adds no schema migration", () => {
      assert.equal(readdirSync("prisma/migrations").filter((name) => /r14b|distribution_history/i.test(name)).length, 0);
      const source = read("lib/distribution/reporting.ts");
      assert.match(source, /events: \{ where: \{ createdAt: \{ gte: period\.from, lte: period\.to \} \}/);
      assert.doesNotMatch(source, /prospect:\s*\{|email:\s*true|phone:\s*true/);
    });
    await check("UI and CSV explicitly separate LIVE state from historical funnel activity", () => {
      const page = read("app/distribuce/reporting/page.tsx"), csv = read("app/api/distribution/report.csv/route.ts");
      for (const marker of ["LIVE fáze pipeline", "Pohyby funnelu", "Podepsané opce v období", "nejde o dnešní stav"]) assert.match(page, new RegExp(marker));
      for (const marker of ["HISTORIE FUNNELU", "historických událostí", "export bez osobních údajů"]) assert.match(csv, new RegExp(marker));
      assert.doesNotMatch(csv, /\.email|\.phone|prospect\.name/);
    });
    await check("R14B is covered by browser smoke, CI and the pipeline", () => {
      assert.match(read("e2e/flatcloud.smoke.spec.ts"), /Pohyby funnelu/);
      assert.match(read(".github/workflows/ci.yml"), /verify:r14b-distribution-history/);
      assert.match(read("UX-REMODEL-PIPELINE.md"), /R14B implementováno/);
    });
  } finally {
    if (opportunityId) await prisma.distributionOpportunityEvent.deleteMany({ where: { opportunityId } });
    await prisma.distributionOpportunity.deleteMany({ where: { prospectId: prospect.id } });
    await prisma.distributionProspect.delete({ where: { id: prospect.id } });
    await prisma.unit.deleteMany({ where: { propertyId: property.id } });
    await prisma.property.delete({ where: { id: property.id } });
    await prisma.owner.delete({ where: { id: owner.id } });
    await prisma.$disconnect();
  }
  console.log(`R14B verifier passed (${passed} checks).`);
}

main().catch((error) => { console.error(error); process.exit(1); });
