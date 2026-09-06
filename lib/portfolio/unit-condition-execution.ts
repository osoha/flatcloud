import type { TaskPriority, UnitConditionPlanStatus, UnitInvestmentUrgency, UnitQualityRating } from "@prisma/client";
import { editableUnitWhere } from "@/lib/access";
import { prisma } from "@/lib/db";

type Actor = { id: string; role: string; allProperties?: boolean };
type PriorityInput = { rating: UnitQualityRating; investmentUrgency: UnitInvestmentUrgency; planStatus: UnitConditionPlanStatus; targetDate: Date | null };

export function unitConditionPriority(input: PriorityInput, now = new Date()) {
  if (input.planStatus === "COMPLETED") return { score: -1_000, label: "Dokončeno", tone: "ok" } as const;
  const urgency = { NONE: 0, MONITOR: 8, PLAN_12_MONTHS: 24, IMMEDIATE: 42 }[input.investmentUrgency];
  const condition = { A_EXCELLENT: 0, B_GOOD: 5, C_RENOVATE: 18, D_MAJOR_WORK: 32 }[input.rating];
  const workflow = { MONITORING: 0, PLANNED: 6, APPROVED: 10, IN_PROGRESS: 14, COMPLETED: 0 }[input.planStatus];
  const overdue = input.targetDate && input.targetDate.getTime() < now.getTime() ? 18 : 0;
  const score = urgency + condition + workflow + overdue;
  if (score >= 70) return { score, label: "Kritická", tone: "bad" } as const;
  if (score >= 45) return { score, label: "Vysoká", tone: "warn" } as const;
  if (score >= 20) return { score, label: "Střední", tone: "" } as const;
  return { score, label: "Nízká", tone: "ok" } as const;
}

export function taskPriorityForCondition(urgency: UnitInvestmentUrgency): TaskPriority {
  return urgency === "IMMEDIATE" ? "URGENT" : urgency === "PLAN_12_MONTHS" ? "HIGH" : urgency === "MONITOR" ? "NORMAL" : "LOW";
}

export async function executeApprovedUnitConditionPlan(actor: Actor, propertyId: string, unitId: string, assessmentId: string, input: { title?: string | null }) {
  const title = input.title?.trim() || "Obnova jednotky";
  if (title.length > 160) throw new Error("Název akce může mít nejvýše 160 znaků.");
  return prisma.$transaction(async (tx) => {
    const unit = await tx.unit.findFirst({
      where: { id: unitId, propertyId, ...editableUnitWhere(actor, propertyId) },
      select: { id: true, label: true, property: { select: { id: true, name: true, managerId: true } }, conditionAssessments: { orderBy: [{ assessedAt: "desc" }, { createdAt: "desc" }], take: 1, include: { execution: true } } },
    });
    if (!unit) throw new Error("Nemáte oprávnění převést plán této jednotky.");
    const assessment = unit.conditionAssessments[0];
    if (!assessment || assessment.id !== assessmentId) throw new Error("Převést lze pouze aktuální technické hodnocení.");
    if (assessment.planStatus !== "APPROVED") throw new Error("Do realizace lze převést pouze schválený plán obnovy.");
    if (!assessment.targetDate) throw new Error("Schválený plán musí mít cílový termín.");
    if (assessment.estimatedCapexCents <= 0) throw new Error("Schválený plán musí mít kladný odhad CAPEX.");
    if (assessment.execution) throw new Error("Tento plán již byl převeden do realizace.");
    const openExecution = await tx.unitConditionPlanExecution.findFirst({ where: { assessment: { unitId }, task: { status: { in: ["OPEN", "IN_PROGRESS", "WAITING"] } } }, select: { id: true } });
    if (openExecution) throw new Error("Jednotka již má otevřenou CAPEX realizaci.");
    const actionTitle = title === "Obnova jednotky" ? `${title} ${unit.label}` : title;
    const sourceNote = `Vzniklo převodem schváleného plánu kvality ${assessment.id}. ${assessment.note || ""}`.trim();
    const task = await tx.task.create({ data: { title: actionTitle, description: sourceNote, category: "MAINTENANCE", status: "OPEN", priority: taskPriorityForCondition(assessment.investmentUrgency), propertyId, unitId, createdById: actor.id, assigneeId: unit.property.managerId || actor.id, dueAt: assessment.targetDate, dedupeKey: `condition-plan:${assessment.id}`, entries: { create: { authorId: actor.id, kind: "SYSTEM", body: "Úkol vznikl převodem schváleného CAPEX plánu." } } } });
    const propertyCost = await tx.propertyCost.create({ data: { propertyId, unitId, kind: "CAPEX", status: "PLANNED", category: "CONSTRUCTION", title: actionTitle, amountCents: assessment.estimatedCapexCents, effectiveAt: assessment.targetDate, note: sourceNote, allocations: { create: { unitId, shareBasisPoints: 10_000, amountCents: assessment.estimatedCapexCents } } } });
    const budgetLine = await tx.propertyBudgetLine.create({ data: { propertyId, year: assessment.targetDate.getUTCFullYear(), kind: "CAPEX", category: "CONSTRUCTION", title: actionTitle, amountCents: assessment.estimatedCapexCents, note: sourceNote } });
    const execution = await tx.unitConditionPlanExecution.create({ data: { assessmentId, propertyId, taskId: task.id, propertyCostId: propertyCost.id, budgetLineId: budgetLine.id, createdById: actor.id } });
    await tx.auditLog.create({ data: { userId: actor.id, propertyId, action: "UNIT_CONDITION_PLAN_EXECUTED", entityType: "UnitConditionPlanExecution", entityId: execution.id, details: { assessmentId, unitId, taskId: task.id, propertyCostId: propertyCost.id, budgetLineId: budgetLine.id, amountCents: assessment.estimatedCapexCents, targetDate: assessment.targetDate.toISOString() } } });
    return { execution, task, propertyCost, budgetLine };
  });
}
