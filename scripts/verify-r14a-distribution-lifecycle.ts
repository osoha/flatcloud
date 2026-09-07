import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { prisma } from "../lib/db";
import { createDistributionOpportunity, createDistributionProspect, updateDistributionOpportunity } from "../lib/distribution/crm";

const read = (path: string) => readFileSync(path, "utf8");
let passed = 0;
async function check(name: string, run: () => void | Promise<void>) { await run(); passed += 1; console.log(`✓ ${name}`); }

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: "SUPER_ADMIN", active: true }, select: { id: true, role: true, allProperties: true } });
  assert.ok(admin);
  const marker = `r14a-${Date.now()}`;
  const owner = await prisma.owner.create({ data: { name: `${marker}-owner`, affiliation: "FLATCLOUD_GROUP" } });
  const property = await prisma.property.create({ data: { name: `${marker}-property`, address: "Lifecycle 1", city: "Praha", ownerId: owner.id, flatcloudConsolidationBasisPoints: 10_000, units: { create: { label: "R14A-1" } } }, include: { units: true } });
  const prospect = await createDistributionProspect(admin, { name: `${marker}-buyer`, email: `${marker}@example.test` });
  let opportunityId = "";
  try {
    await check("opportunity creation records the first immutable funnel event", async () => {
      const opportunity = await createDistributionOpportunity(admin, { prospectId: prospect.id, unitId: property.units[0].id, stage: "NEW", askingPriceCents: 5_000_000_00, offeredPriceCents: null, nextActionAt: null, optionStatus: "NONE" });
      opportunityId = opportunity.id;
      const events = await prisma.distributionOpportunityEvent.findMany({ where: { opportunityId } });
      assert.equal(events.length, 1);
      assert.equal(events[0].fromStage, null);
      assert.equal(events[0].toStage, "NEW");
    });
    await check("signed option requires price, expiry and document reference", async () => {
      await assert.rejects(updateDistributionOpportunity(admin, opportunityId, { stage: "OFFER", askingPriceCents: 5_000_000_00, offeredPriceCents: 4_900_000_00, nextActionAt: null, optionStatus: "SIGNED", optionExpiresAt: null, optionPriceCents: null, optionReference: null }), /vyžaduje cenu a datum/);
      const updated = await updateDistributionOpportunity(admin, opportunityId, { stage: "RESERVED", askingPriceCents: 5_000_000_00, offeredPriceCents: 4_900_000_00, nextActionAt: new Date("2026-10-01"), optionStatus: "SIGNED", optionExpiresAt: new Date("2026-11-01"), optionPriceCents: 150_000_00, optionReference: "OPCE-R14A" });
      assert.equal(updated.optionStatus, "SIGNED");
      assert.equal(updated.optionReference, "OPCE-R14A");
      await assert.rejects(updateDistributionOpportunity(admin, opportunityId, { stage: "RESERVED", askingPriceCents: 5_000_000_00, offeredPriceCents: 4_900_000_00, nextActionAt: null, optionStatus: "OFFERED", optionExpiresAt: new Date("2026-11-01"), optionPriceCents: 150_000_00, optionReference: "OPCE-R14A" }), /přechod stavu opce není povolen/);
    });
    await check("funnel history preserves before and after stages", async () => {
      const events = await prisma.distributionOpportunityEvent.findMany({ where: { opportunityId }, orderBy: { createdAt: "asc" } });
      assert.equal(events.length, 2);
      assert.equal(events[1].fromStage, "NEW");
      assert.equal(events[1].toStage, "RESERVED");
      assert.equal(events[1].optionStatus, "SIGNED");
      assert.equal(events[1].optionReference, "OPCE-R14A");
    });
    await check("migration is additive and database-enforces positive prices", () => {
      const migration = read("prisma/migrations/20260907090000_distribution_lifecycle_options/migration.sql");
      for (const marker of ["DistributionOptionStatus", "DistributionOpportunityEvent", "DistributionOpportunity_optionPrice_check", "ON DELETE RESTRICT", "INSERT INTO \"DistributionOpportunityEvent\""]) assert.match(migration, new RegExp(marker));
      assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM/i);
    });
    await check("CRM UI exposes valuation prefill, option lifecycle and event history", () => {
      const page = read("app/distribuce/zajemci/page.tsx"), prefill = read("components/distribution/ValuationPricePrefill.tsx");
      for (const marker of ["Stav opce", "Cena opce Kč", "Platnost opce do", "Reference dokumentu", "Historie funnelu"]) assert.match(page, new RegExp(marker));
      assert.match(page, /moneyInput\(cents\)\.replace\(",", "\."\)/);
      assert.match(prefill, /input\[name="askingPrice"\]/);
      assert.match(prefill, /!input\.value/);
    });
    await check("R14A is covered by routes, browser smoke, CI and pipeline", () => {
      assert.match(read("app/api/distribution/opportunities/[opportunityId]/route.ts"), /optionStatus/);
      assert.match(read("e2e/flatcloud.smoke.spec.ts"), /Opce podepsána/);
      assert.match(read(".github/workflows/ci.yml"), /verify:r14a-distribution-lifecycle/);
      assert.match(read("UX-REMODEL-PIPELINE.md"), /R14A implementováno/);
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
  console.log(`R14A verifier passed (${passed} checks).`);
}

main().catch((error) => { console.error(error); process.exit(1); });
