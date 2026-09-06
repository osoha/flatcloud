import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { prisma } from "../lib/db";
import { createUnitConditionAssessment } from "../lib/portfolio/unit-condition-assessments";
import { executeApprovedUnitConditionPlan, taskPriorityForCondition, unitConditionPriority } from "../lib/portfolio/unit-condition-execution";

const read = (path: string) => readFileSync(path, "utf8");
let checks = 0;
async function check(name: string, run: () => Promise<void> | void) { await run(); checks += 1; console.log(`✓ ${checks}. ${name}`); }

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: "SUPER_ADMIN", active: true }, select: { id: true, role: true, allProperties: true } });
  assert.ok(admin, "CI seed must contain an active super admin");
  const suffix = Date.now().toString();
  const owner = await prisma.owner.create({ data: { name: `R8B owner ${suffix}`, affiliation: "EXTERNAL" } });
  const property = await prisma.property.create({ data: { name: `R8B property ${suffix}`, address: "Test 8B", city: "Praha", ownerId: owner.id, flatcloudConsolidationBasisPoints: 0, units: { create: [{ label: "R8B-1", areaM2: 55 }, { label: "R8B-2", areaM2: 45 }] } }, include: { units: true } });
  const targetDate = new Date("2027-02-15T12:00:00Z");

  await check("priority is deterministic and completed plans leave the active queue", () => {
    assert.equal(unitConditionPriority({ rating: "D_MAJOR_WORK", investmentUrgency: "IMMEDIATE", planStatus: "APPROVED", targetDate: new Date("2026-01-01") }, new Date("2026-09-06")).label, "Kritická");
    assert.equal(unitConditionPriority({ rating: "D_MAJOR_WORK", investmentUrgency: "IMMEDIATE", planStatus: "COMPLETED", targetDate: new Date("2026-01-01") }).score, -1_000);
    assert.equal(taskPriorityForCondition("IMMEDIATE"), "URGENT");
  });

  const approved = await createUnitConditionAssessment(admin, property.id, property.units[0].id, { rating: "C_RENOVATE", investmentUrgency: "PLAN_12_MONTHS", estimatedCapexCents: 640_000_00, planStatus: "APPROVED", targetDate, assessedAt: new Date(), note: "Schváleno v CI" });
  await check("approved plan atomically creates task, planned cost and annual budget", async () => {
    const result = await executeApprovedUnitConditionPlan(admin, property.id, property.units[0].id, approved.id, { title: "Rekonstrukce R8B" });
    assert.equal(result.task.category, "MAINTENANCE");
    assert.equal(result.task.priority, "HIGH");
    assert.equal(result.propertyCost.kind, "CAPEX");
    assert.equal(result.propertyCost.status, "PLANNED");
    assert.equal(result.propertyCost.amountCents, approved.estimatedCapexCents);
    assert.equal(result.budgetLine.year, 2027);
    assert.equal(result.budgetLine.amountCents, approved.estimatedCapexCents);
    assert.ok(await prisma.auditLog.findFirst({ where: { entityId: result.execution.id, action: "UNIT_CONDITION_PLAN_EXECUTED" } }));
    assert.equal(await prisma.propertyCostAllocation.count({ where: { propertyCostId: result.propertyCost.id, unitId: property.units[0].id, shareBasisPoints: 10_000 } }), 1);
    await assert.rejects(() => prisma.unitConditionPlanExecution.update({ where: { id: result.execution.id }, data: { propertyId: property.id } }));
  });

  await check("repeat, stale, unapproved and unauthorized conversions are rejected", async () => {
    await assert.rejects(() => executeApprovedUnitConditionPlan(admin, property.id, property.units[0].id, approved.id, { title: "Duplicitní" }), /již byl převeden|otevřenou CAPEX realizaci/);
    const planned = await createUnitConditionAssessment(admin, property.id, property.units[1].id, { rating: "B_GOOD", investmentUrgency: "MONITOR", estimatedCapexCents: 50_000_00, planStatus: "PLANNED", targetDate, assessedAt: new Date() });
    await assert.rejects(() => executeApprovedUnitConditionPlan(admin, property.id, property.units[1].id, planned.id, { title: "Předčasné" }), /pouze schválený plán/);
    await assert.rejects(() => executeApprovedUnitConditionPlan({ id: admin.id, role: "OWNER" }, property.id, property.units[1].id, planned.id, { title: "Bez práva" }), /oprávnění/);
  });

  await check("migration is additive and execution linkage is immutable", () => {
    const schema = read("prisma/schema.prisma"); const migration = read("prisma/migrations/20260906090000_unit_condition_plan_execution/migration.sql");
    for (const marker of ["model UnitConditionPlanExecution", "assessmentId", "propertyCostId", "budgetLineId", "@@index([propertyId, createdAt])"]) assert.match(schema, new RegExp(marker.replace(/[?*+.[\]{}()]/g, "\\$&")));
    for (const marker of ["UnitConditionPlanExecution_assessmentId_key", "UnitConditionPlanExecution_immutable_trigger", "BEFORE UPDATE OR DELETE", "ON DELETE RESTRICT"]) assert.match(migration, new RegExp(marker));
    assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|TRUNCATE/);
  });

  await check("UI exposes a compact prioritized and traceable workflow", () => {
    const page = read("app/portfolio/kvalita/page.tsx"); const detail = read("app/nemovitosti/[id]/jednotky/[unitId]/page.tsx");
    for (const marker of ["Prioritní fronta obnovy", "Převést plán", "Připraveno k zahájení", "Řídit realizaci", "Úkol", "CAPEX", "Rozpočet"]) assert.match(page, new RegExp(marker));
    assert.match(detail, /Převést schválený plán do realizace/); assert.match(detail, /Plán je v realizaci/);
  });

  await check("methodology pipeline browser smoke and CI cover R8B", () => {
    assert.match(read("lib/methodology.ts"), /právě jeden úkol, náklad a rozpočtovou položku/);
    assert.match(read("UX-REMODEL-PIPELINE.md"), /R8B implementováno aditivně/);
    assert.match(read("e2e/flatcloud.smoke.spec.ts"), /schválený CAPEX plán se právě jednou převede do realizace/);
    assert.match(read(".github/workflows/ci.yml"), /verify:ux-remodel-r8b/);
  });
  console.log(`UX remodel R8B ověřen: ${checks} kontrol.`);
}

main().finally(() => prisma.$disconnect());
