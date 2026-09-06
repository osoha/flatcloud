import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { prisma } from "../lib/db";
import { createUnitDistributionReadiness } from "../lib/distribution/unit-assessments";
import { createUnitConditionAssessment } from "../lib/portfolio/unit-condition-assessments";

const read = (path: string) => readFileSync(path, "utf8");
let checks = 0;
async function check(name: string, run: () => Promise<void> | void) {
  await run();
  checks += 1;
  console.log(`✓ ${checks}. ${name}`);
}

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: "SUPER_ADMIN", active: true }, select: { id: true, role: true, allProperties: true } });
  assert.ok(admin, "CI seed must contain an active super admin");
  const suffix = Date.now().toString();
  const owner = await prisma.owner.create({ data: { name: `R8A owner ${suffix}`, affiliation: "FLATCLOUD_GROUP" } });
  const external = await prisma.property.create({ data: { name: `R8A external ${suffix}`, address: "Test 8", city: "Praha", ownerId: owner.id, flatcloudConsolidationBasisPoints: 0, units: { create: { label: "EXT-8A", areaM2: 48 } } }, include: { units: true } });
  const internal = await prisma.property.create({ data: { name: `R8A internal ${suffix}`, address: "Test 8", city: "Praha", ownerId: owner.id, flatcloudConsolidationBasisPoints: 10_000, units: { create: { label: "INT-8A", areaM2: 54 } } }, include: { units: true } });

  await check("technical quality accepts an authorized external asset", async () => {
    const result = await createUnitConditionAssessment(admin, external.id, external.units[0].id, { rating: "C_RENOVATE", investmentUrgency: "PLAN_12_MONTHS", estimatedCapexCents: 350_000, planStatus: "PLANNED", targetDate: new Date(Date.now() + 30 * 86_400_000), assessedAt: new Date(), note: "R8A CI" });
    assert.equal(result.planStatus, "PLANNED");
    assert.equal(result.estimatedCapexCents, 350_000);
    assert.ok(await prisma.auditLog.findFirst({ where: { entityId: result.id, action: "UNIT_CONDITION_ASSESSMENT_CREATED" } }));
    await assert.rejects(() => prisma.unitConditionAssessment.update({ where: { id: result.id }, data: { estimatedCapexCents: 1 } }));
  });

  await check("property access and plan validation protect writes", async () => {
    await assert.rejects(() => createUnitConditionAssessment({ id: admin.id, role: "OWNER" }, external.id, external.units[0].id, { rating: "B_GOOD", investmentUrgency: "MONITOR", estimatedCapexCents: 0, planStatus: "MONITORING", assessedAt: new Date() }), /oprávnění/);
    await assert.rejects(() => createUnitConditionAssessment(admin, internal.id, internal.units[0].id, { rating: "D_MAJOR_WORK", investmentUrgency: "IMMEDIATE", estimatedCapexCents: 900_000, planStatus: "APPROVED", assessedAt: new Date() }), /cílový termín/);
  });

  await check("distribution consumes but does not own the technical snapshot", async () => {
    await assert.rejects(() => createUnitDistributionReadiness(admin, internal.id, internal.units[0].id, { distributionReady: true, assessedAt: new Date() }), /Nejprve doplňte technické hodnocení/);
    const condition = await createUnitConditionAssessment(admin, internal.id, internal.units[0].id, { rating: "B_GOOD", investmentUrgency: "MONITOR", estimatedCapexCents: 100_000, planStatus: "MONITORING", assessedAt: new Date() });
    const readiness = await createUnitDistributionReadiness(admin, internal.id, internal.units[0].id, { distributionReady: true, assessedAt: new Date(), note: "R8A readiness" });
    assert.equal(readiness.rating, condition.rating);
    assert.ok(await prisma.auditLog.findFirst({ where: { entityId: readiness.id, action: "UNIT_DISTRIBUTION_READINESS_CREATED" } }));
  });

  await check("migration is additive, backfills history and keeps snapshots immutable", () => {
    const schema = read("prisma/schema.prisma");
    const migration = read("prisma/migrations/20260906070000_unit_condition_assessments/migration.sql");
    for (const marker of ["enum UnitConditionPlanStatus", "model UnitConditionAssessment", "planStatus", "targetDate", "@@index([unitId, assessedAt])"]) assert.match(schema, new RegExp(marker.replace(/[?*+.[\]{}()]/g, "\\$&")));
    for (const marker of ["INSERT INTO \"UnitConditionAssessment\"", "FROM \"UnitAssetAssessment\"", "UnitConditionAssessment_immutable_trigger", "BEFORE UPDATE OR DELETE", "ON DELETE RESTRICT"]) assert.match(migration, new RegExp(marker));
    assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|TRUNCATE/);
  });

  await check("portfolio and unit UI expose one clean quality workflow", () => {
    const quality = read("app/portfolio/kvalita/page.tsx");
    const detail = read("app/nemovitosti/[id]/jednotky/[unitId]/page.tsx");
    const distribution = read("app/distribuce/page.tsx");
    for (const marker of ["Kvalita a technický stav portfolia", "všechna spravovaná aktiva", "Stav jednotek a plán obnovy", "UnitConditionAssessmentForm"]) assert.match(quality, new RegExp(marker));
    for (const marker of ["id=\"kvalita\"", "Kvalita a plán obnovy", "Historie hodnocení"]) assert.match(detail, new RegExp(marker));
    assert.match(distribution, /Technický stav je samostatný podklad/);
    assert.doesNotMatch(distribution, /name="rating"|name="investmentUrgency"|name="estimatedCapex"/);
  });

  await check("pipeline, browser smoke and CI cover R8A", () => {
    assert.match(read("UX-REMODEL-PIPELINE.md"), /R8A implementováno aditivně/);
    assert.match(read("prisma/seed-portfolio-quality.ts"), /QA_PORTFOLIO_QUALITY_R8A_V1/);
    assert.match(read("prisma/seed.ts"), /ensurePortfolioQualityScenarios/);
    assert.match(read("e2e/flatcloud.smoke.spec.ts"), /kvalita jednotky a distribuční připravenost mají oddělený průchod/);
    assert.match(read(".github/workflows/ci.yml"), /verify:ux-remodel-r8a/);
  });

  console.log(`UX remodel R8A ověřen: ${checks} kontrol.`);
}

main().finally(() => prisma.$disconnect());
