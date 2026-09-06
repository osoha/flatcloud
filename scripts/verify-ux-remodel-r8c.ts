import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { prisma } from "../lib/db";
import { createUnitConditionAssessment } from "../lib/portfolio/unit-condition-assessments";
import {
  executeApprovedUnitConditionPlan,
  progressUnitConditionPlanExecution,
  unitConditionCapexVariance,
  unitConditionExecutionState,
} from "../lib/portfolio/unit-condition-execution";

const read = (path: string) => readFileSync(path, "utf8");
let checks = 0;
async function check(name: string, run: () => Promise<void> | void) {
  await run();
  checks += 1;
  console.log(`✓ ${checks}. ${name}`);
}

async function main() {
  const admin = await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN", active: true },
    select: { id: true, role: true, allProperties: true },
  });
  assert.ok(admin, "CI seed must contain an active super admin");
  const suffix = Date.now().toString();
  const owner = await prisma.owner.create({ data: { name: `R8C owner ${suffix}`, affiliation: "EXTERNAL" } });
  const property = await prisma.property.create({
    data: {
      name: `R8C property ${suffix}`,
      address: "Test 8C",
      city: "Praha",
      ownerId: owner.id,
      flatcloudConsolidationBasisPoints: 0,
      units: { create: [{ label: "R8C-1", areaM2: 63 }, { label: "R8C-2", areaM2: 41 }] },
    },
    include: { units: true },
  });
  const now = Date.now();
  const targetDate = new Date(now + 365 * 24 * 60 * 60 * 1_000);
  const approved = await createUnitConditionAssessment(admin, property.id, property.units[0].id, {
    rating: "C_RENOVATE",
    investmentUrgency: "PLAN_12_MONTHS",
    estimatedCapexCents: 640_000_00,
    planStatus: "APPROVED",
    targetDate,
    assessedAt: new Date(now - 5 * 24 * 60 * 60 * 1_000),
    note: "R8C integrační scénář",
  });
  const converted = await executeApprovedUnitConditionPlan(admin, property.id, property.units[0].id, approved.id, { title: "Rekonstrukce R8C" });

  await check("execution state and variance are deterministic", () => {
    assert.equal(unitConditionExecutionState([]).key, "READY");
    assert.equal(unitConditionExecutionState([{ kind: "STARTED", actualAmountCents: null, effectiveAt: new Date() }]).key, "STARTED");
    assert.equal(unitConditionExecutionState([{ kind: "STARTED", actualAmountCents: null, effectiveAt: new Date() }, { kind: "COMPLETED", actualAmountCents: 675_000_00, effectiveAt: new Date() }]).key, "COMPLETED");
    assert.deepEqual(unitConditionCapexVariance(640_000_00, 675_000_00), { amountCents: 35_000_00, basisPoints: 547 });
  });

  const startedAt = new Date(now - 2 * 24 * 60 * 60 * 1_000);
  await check("starting appends an event and moves linked records into progress", async () => {
    await progressUnitConditionPlanExecution(admin, property.id, property.units[0].id, converted.execution.id, { action: "START", effectiveAt: startedAt, note: "Stavba předána" });
    const execution = await prisma.unitConditionPlanExecution.findUniqueOrThrow({
      where: { id: converted.execution.id },
      include: { events: true, task: true, propertyCost: true },
    });
    assert.equal(execution.events.length, 1);
    assert.equal(execution.events[0].kind, "STARTED");
    assert.equal(execution.task.status, "IN_PROGRESS");
    assert.equal(execution.propertyCost.status, "COMMITTED");
    assert.ok(await prisma.auditLog.findFirst({ where: { action: "UNIT_CONDITION_EXECUTION_STARTED", details: { path: ["executionId"], equals: execution.id } } }));
  });

  const completedAt = new Date(now - 24 * 60 * 60 * 1_000);
  await check("completion records actual CAPEX, variance and closes the task", async () => {
    await assert.rejects(() => progressUnitConditionPlanExecution(admin, property.id, property.units[0].id, converted.execution.id, { action: "COMPLETE", actualAmountCents: 675_000_00, effectiveAt: new Date(now - 3 * 24 * 60 * 60 * 1_000) }), /nesmí předcházet/);
    const result = await progressUnitConditionPlanExecution(admin, property.id, property.units[0].id, converted.execution.id, { action: "COMPLETE", actualAmountCents: 675_000_00, effectiveAt: completedAt, note: "Převzato bez vad" });
    assert.deepEqual(result.variance, { amountCents: 35_000_00, basisPoints: 547 });
    const execution = await prisma.unitConditionPlanExecution.findUniqueOrThrow({
      where: { id: converted.execution.id },
      include: { events: { orderBy: { effectiveAt: "asc" } }, task: true, propertyCost: { include: { allocations: true } }, budgetLine: true },
    });
    assert.deepEqual(execution.events.map((event) => event.kind), ["STARTED", "COMPLETED"]);
    assert.equal(execution.events[1].actualAmountCents, 675_000_00);
    assert.equal(execution.task.status, "DONE");
    assert.equal(execution.task.closedAt?.toISOString(), completedAt.toISOString());
    assert.equal(execution.propertyCost.status, "ACTUAL");
    assert.equal(execution.propertyCost.amountCents, 675_000_00);
    assert.equal(execution.propertyCost.allocations[0].amountCents, 675_000_00);
    assert.equal(execution.budgetLine.amountCents, 640_000_00);
    assert.ok(await prisma.auditLog.findFirst({ where: { action: "UNIT_CONDITION_EXECUTION_COMPLETED", details: { path: ["executionId"], equals: execution.id } } }));
  });

  await check("invalid ordering, repetition and generic task closure are blocked", async () => {
    await assert.rejects(() => progressUnitConditionPlanExecution(admin, property.id, property.units[0].id, converted.execution.id, { action: "START" }), /dokončenou realizaci/i);
    await assert.rejects(() => progressUnitConditionPlanExecution(admin, property.id, property.units[0].id, converted.execution.id, { action: "COMPLETE", actualAmountCents: 1 }), /již byla dokončena/i);
    const secondApproved = await createUnitConditionAssessment(admin, property.id, property.units[1].id, { rating: "B_GOOD", investmentUrgency: "MONITOR", estimatedCapexCents: 80_000_00, planStatus: "APPROVED", targetDate, assessedAt: new Date() });
    const second = await executeApprovedUnitConditionPlan(admin, property.id, property.units[1].id, secondApproved.id, { title: "Druhá akce R8C" });
    await assert.rejects(() => progressUnitConditionPlanExecution(admin, property.id, property.units[1].id, second.execution.id, { action: "COMPLETE", actualAmountCents: 80_000_00 }), /nejprve zahájit/i);
    await assert.rejects(() => progressUnitConditionPlanExecution({ id: admin.id, role: "OWNER" }, property.id, property.units[1].id, second.execution.id, { action: "START" }), /oprávnění/i);
    assert.match(read("app/api/tasks/[id]/close/route.ts"), /CAPEX realizaci dokončete v modulu Kvalita a CAPEX/);
    assert.match(read("app/api/tasks/[id]/route.ts"), /Stav CAPEX realizace měňte v modulu Kvalita a CAPEX/);
  });

  await check("execution events are additive and immutable", async () => {
    const schema = read("prisma/schema.prisma");
    const migration = read("prisma/migrations/20260906110000_unit_condition_execution_events/migration.sql");
    for (const marker of ["model UnitConditionExecutionEvent", "UnitConditionExecutionEventKind", "@@unique([executionId, kind])"]) assert.match(schema, new RegExp(marker.replace(/[?*+.[\]{}()]/g, "\\$&")));
    for (const marker of ["UnitConditionExecutionEvent_immutable_trigger", "BEFORE UPDATE OR DELETE", "ON DELETE RESTRICT"]) assert.match(migration, new RegExp(marker));
    assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|TRUNCATE/);
    const event = await prisma.unitConditionExecutionEvent.findFirstOrThrow({ where: { executionId: converted.execution.id } });
    await assert.rejects(() => prisma.unitConditionExecutionEvent.update({ where: { id: event.id }, data: { note: "Přepsání" } }));
  });

  await check("navigation keeps quality in Operations and removes the dashboard shortcut", () => {
    const shell = read("components/Shell.tsx");
    const tasks = shell.indexOf('href="/ukoly"');
    const quality = shell.indexOf('href="/portfolio/kvalita"');
    const finance = shell.indexOf('<div className="nav-label">Finance</div>');
    assert.ok(tasks >= 0 && quality > tasks && finance > quality, "Kvalita a CAPEX must sit after Tasks in Operations");
    const portfolio = read("app/portfolio/page.tsx");
    assert.doesNotMatch(portfolio, /href="\/portfolio\/kvalita"/);
  });

  await check("all floating forms share an explicit and keyboard dismiss path", () => {
    const component = read("components/DismissibleDetails.tsx");
    for (const marker of ["Zavřít", 'event.key === "Escape"', 'document.addEventListener("pointerdown"', 'role="dialog"']) assert.match(component, new RegExp(marker.replace(/[?*+.[\]{}()]/g, "\\$&")));
    for (const file of ["app/portfolio/kvalita/page.tsx", "app/distribuce/page.tsx", "app/distribuce/zajemci/page.tsx", "app/uzivatele/page.tsx", "app/nemovitosti/[id]/[section]/page.tsx", "app/reporty/valorizace/[planId]/page.tsx"]) assert.match(read(file), /DismissibleDetails/);
    const scope = read("components/PortfolioScopePicker.tsx");
    assert.match(scope, /event\.key === "Escape"/);
    assert.match(scope, /pointerdown/);
  });

  await check("methodology, pipeline, browser smoke and CI cover R8C", () => {
    assert.match(read("lib/methodology.ts"), /skutečný náklad a viditelnou odchylku/);
    assert.match(read("UX-REMODEL-PIPELINE.md"), /R8C implementováno aditivně/);
    assert.match(read("e2e/flatcloud.smoke.spec.ts"), /CAPEX realizace projde zahájením/);
    assert.match(read(".github/workflows/ci.yml"), /verify:ux-remodel-r8c/);
  });

  console.log(`UX remodel R8C ověřen: ${checks} kontrol.`);
}

main().finally(() => prisma.$disconnect());
