import type { PrismaClient } from "@prisma/client";

const marker = "QA_PORTFOLIO_QUALITY_R8A_V1";

export async function ensurePortfolioQualityScenarios(prisma: PrismaClient, adminId: string) {
  if (await prisma.auditLog.findFirst({ where: { action: "QA_PORTFOLIO_QUALITY_CREATED", entityType: "System", details: { path: ["marker"], equals: marker } }, select: { id: true } })) {
    console.log("Scénářová data kvality portfolia R8A již existují.");
    return;
  }

  const properties = await prisma.property.findMany({
    where: { active: true, units: { some: {} } },
    orderBy: [{ flatcloudConsolidationBasisPoints: "desc" }, { name: "asc" }],
    select: { id: true, name: true, flatcloudConsolidationBasisPoints: true, units: { orderBy: { label: "asc" }, take: 2, select: { id: true, label: true } } },
  });
  const internalUnits = properties.filter((property) => (property.flatcloudConsolidationBasisPoints || 0) > 0).flatMap((property) => property.units.map((unit) => ({ property, unit })));
  const externalUnit = properties.find((property) => property.flatcloudConsolidationBasisPoints === 0)?.units[0];
  const scenarios = [
    internalUnits[0] && { unitId: internalUnits[0].unit.id, label: `${internalUnits[0].property.name} · ${internalUnits[0].unit.label}`, rating: "B_GOOD" as const, investmentUrgency: "MONITOR" as const, estimatedCapexCents: 75_000_00, planStatus: "MONITORING" as const, targetDate: null, note: `${marker} · průběžné sledování bez schválené akce` },
    internalUnits[1] && { unitId: internalUnits[1].unit.id, label: `${internalUnits[1].property.name} · ${internalUnits[1].unit.label}`, rating: "C_RENOVATE" as const, investmentUrgency: "PLAN_12_MONTHS" as const, estimatedCapexCents: 480_000_00, planStatus: "PLANNED" as const, targetDate: new Date("2026-12-15T12:00:00Z"), note: `${marker} · plán obnovy koupelny a povrchů` },
    externalUnit && { unitId: externalUnit.id, label: `externí správa · ${externalUnit.label}`, rating: "D_MAJOR_WORK" as const, investmentUrgency: "IMMEDIATE" as const, estimatedCapexCents: 900_000_00, planStatus: "APPROVED" as const, targetDate: new Date("2026-10-15T12:00:00Z"), note: `${marker} · urgentní technický zásah nezávislý na distribuci` },
  ].filter((scenario): scenario is NonNullable<typeof scenario> => Boolean(scenario));

  for (const scenario of scenarios) {
    await prisma.unitConditionAssessment.create({ data: { unitId: scenario.unitId, rating: scenario.rating, investmentUrgency: scenario.investmentUrgency, estimatedCapexCents: scenario.estimatedCapexCents, planStatus: scenario.planStatus, targetDate: scenario.targetDate, assessedAt: new Date("2026-09-05T12:00:00Z"), note: scenario.note, createdById: adminId } });
  }
  await prisma.auditLog.create({ data: { userId: adminId, action: "QA_PORTFOLIO_QUALITY_CREATED", entityType: "System", details: { marker, scenarios: scenarios.map((scenario) => scenario.label) } } });
  console.log(`Scénářová data kvality portfolia R8A byla vložena (${scenarios.length}).`);
}
