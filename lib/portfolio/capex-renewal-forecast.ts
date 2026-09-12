import type { UnitConditionPlanStatus } from "@prisma/client";

export type CapexForecastStage = "INTENT" | "APPROVED" | "IN_PROGRESS" | "COMPLETED";
export type CapexForecastInput = {
  id: string;
  propertyId: string;
  propertyName: string;
  unitId: string;
  unitLabel: string;
  planStatus: UnitConditionPlanStatus;
  plannedAmountCents: number;
  targetDate: Date | null;
  events: { kind: "STARTED" | "COMPLETED"; actualAmountCents: number | null; effectiveAt: Date }[];
};

export const capexForecastStageLabels: Record<CapexForecastStage, string> = {
  INTENT: "Záměr",
  APPROVED: "Schváleno",
  IN_PROGRESS: "V realizaci",
  COMPLETED: "Dokončeno",
};

export function capexForecastStage(input: Pick<CapexForecastInput, "planStatus" | "events">): CapexForecastStage {
  if (input.events.some((event) => event.kind === "COMPLETED") || input.planStatus === "COMPLETED") return "COMPLETED";
  if (input.events.some((event) => event.kind === "STARTED") || input.planStatus === "IN_PROGRESS") return "IN_PROGRESS";
  if (input.planStatus === "APPROVED") return "APPROVED";
  return "INTENT";
}

export function buildCapexRenewalForecast(inputs: CapexForecastInput[], baseYear: number) {
  const horizonYears = Array.from({ length: 5 }, (_, index) => baseYear + index);
  const active = inputs.map((item) => ({ ...item, stage: capexForecastStage(item) })).filter((item) => item.stage !== "COMPLETED");
  const bucketDefinitions = [
    { key: "OVERDUE", label: "Po termínu", test: (item: typeof active[number]) => Boolean(item.targetDate && item.targetDate.getUTCFullYear() < baseYear) },
    ...horizonYears.map((year) => ({ key: String(year), label: String(year), test: (item: typeof active[number]) => item.targetDate?.getUTCFullYear() === year })),
    { key: "LATER", label: `Po ${horizonYears.at(-1)}`, test: (item: typeof active[number]) => Boolean(item.targetDate && item.targetDate.getUTCFullYear() > horizonYears.at(-1)!) },
    { key: "UNSCHEDULED", label: "Bez termínu", test: (item: typeof active[number]) => !item.targetDate },
  ];
  const buckets = bucketDefinitions.map((definition) => {
    const items = active.filter(definition.test);
    return {
      key: definition.key,
      label: definition.label,
      items,
      count: items.length,
      plannedAmountCents: items.reduce((sum, item) => sum + item.plannedAmountCents, 0),
      intentAmountCents: items.filter((item) => item.stage === "INTENT").reduce((sum, item) => sum + item.plannedAmountCents, 0),
      approvedAmountCents: items.filter((item) => item.stage === "APPROVED").reduce((sum, item) => sum + item.plannedAmountCents, 0),
      inProgressAmountCents: items.filter((item) => item.stage === "IN_PROGRESS").reduce((sum, item) => sum + item.plannedAmountCents, 0),
    };
  });
  const completed = inputs.map((item) => ({ ...item, stage: capexForecastStage(item), completion: item.events.find((event) => event.kind === "COMPLETED") })).filter((item) => item.stage === "COMPLETED" && item.completion);
  const completedThisYear = completed.filter((item) => item.completion!.effectiveAt.getUTCFullYear() === baseYear);
  const actualThisYearCents = completedThisYear.reduce((sum, item) => sum + (item.completion!.actualAmountCents || 0), 0);
  const plannedCompletedThisYearCents = completedThisYear.reduce((sum, item) => sum + item.plannedAmountCents, 0);
  return {
    baseYear,
    horizonYears,
    buckets,
    active,
    scheduledFiveYearCents: active.filter((item) => item.targetDate && horizonYears.includes(item.targetDate.getUTCFullYear())).reduce((sum, item) => sum + item.plannedAmountCents, 0),
    overdueCents: buckets.find((bucket) => bucket.key === "OVERDUE")!.plannedAmountCents,
    unscheduledCents: buckets.find((bucket) => bucket.key === "UNSCHEDULED")!.plannedAmountCents,
    inProgressCents: active.filter((item) => item.stage === "IN_PROGRESS").reduce((sum, item) => sum + item.plannedAmountCents, 0),
    actualThisYearCents,
    actualVarianceThisYearCents: actualThisYearCents - plannedCompletedThisYearCents,
  };
}
