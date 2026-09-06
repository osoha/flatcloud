import { UnitConditionPlanStatus, UnitInvestmentUrgency, UnitQualityRating } from "@prisma/client";
import { editableUnitWhere } from "@/lib/access";
import { prisma } from "@/lib/db";

export const unitConditionRatings: Record<UnitQualityRating, string> = {
  A_EXCELLENT: "A · Výborný stav",
  B_GOOD: "B · Dobrý stav",
  C_RENOVATE: "C · Vhodné k renovaci",
  D_MAJOR_WORK: "D · Zásadní investice",
};

export const unitConditionUrgencies: Record<UnitInvestmentUrgency, string> = {
  NONE: "Bez potřeby",
  MONITOR: "Sledovat",
  PLAN_12_MONTHS: "Naplánovat do 12 měsíců",
  IMMEDIATE: "Řešit ihned",
};

export const unitConditionPlanStatuses: Record<UnitConditionPlanStatus, string> = {
  MONITORING: "Sledování",
  PLANNED: "Plánováno",
  APPROVED: "Schváleno",
  IN_PROGRESS: "Probíhá",
  COMPLETED: "Dokončeno",
};

export type UnitConditionActor = { id: string; role: string; allProperties?: boolean };

export async function createUnitConditionAssessment(
  actor: UnitConditionActor,
  propertyId: string,
  unitId: string,
  input: {
    rating: UnitQualityRating;
    investmentUrgency: UnitInvestmentUrgency;
    estimatedCapexCents: number;
    planStatus: UnitConditionPlanStatus;
    targetDate?: Date | null;
    assessedAt: Date;
    note?: string | null;
  },
) {
  if (!Object.values(UnitQualityRating).includes(input.rating) || !Object.values(UnitInvestmentUrgency).includes(input.investmentUrgency)) throw new Error("Vyberte platný stav a naléhavost investice.");
  if (!Object.values(UnitConditionPlanStatus).includes(input.planStatus)) throw new Error("Vyberte platný stav plánu obnovy.");
  if (!Number.isSafeInteger(input.estimatedCapexCents) || input.estimatedCapexCents < 0) throw new Error("Odhad CAPEX nesmí být záporný.");
  if (Number.isNaN(input.assessedAt.getTime()) || input.assessedAt.getTime() > Date.now() + 86_400_000) throw new Error("Datum hodnocení nesmí být v budoucnosti.");
  if (input.targetDate && Number.isNaN(input.targetDate.getTime())) throw new Error("Zadejte platný cílový termín.");
  if (["PLANNED", "APPROVED", "IN_PROGRESS"].includes(input.planStatus) && !input.targetDate) throw new Error("Pro plánovanou nebo probíhající obnovu doplňte cílový termín.");
  if ((input.note || "").length > 2_000) throw new Error("Poznámka může mít nejvýše 2 000 znaků.");

  return prisma.$transaction(async (tx) => {
    const unit = await tx.unit.findFirst({ where: { id: unitId, propertyId, ...editableUnitWhere(actor, propertyId) }, select: { id: true } });
    if (!unit) throw new Error("Nemáte oprávnění hodnotit tuto jednotku.");
    const assessment = await tx.unitConditionAssessment.create({ data: {
      unitId,
      rating: input.rating,
      investmentUrgency: input.investmentUrgency,
      estimatedCapexCents: input.estimatedCapexCents,
      planStatus: input.planStatus,
      targetDate: input.targetDate || null,
      assessedAt: input.assessedAt,
      note: input.note?.trim() || null,
      createdById: actor.id,
    } });
    await tx.auditLog.create({ data: {
      userId: actor.id,
      propertyId,
      action: "UNIT_CONDITION_ASSESSMENT_CREATED",
      entityType: "UnitConditionAssessment",
      entityId: assessment.id,
      details: {
        unitId,
        rating: input.rating,
        investmentUrgency: input.investmentUrgency,
        estimatedCapexCents: input.estimatedCapexCents,
        planStatus: input.planStatus,
        targetDate: input.targetDate?.toISOString() || null,
        assessedAt: input.assessedAt.toISOString(),
      },
    } });
    return assessment;
  });
}
