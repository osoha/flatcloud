import type { DistributionOpportunityStage } from "@prisma/client";

export type OverviewOpportunity = {
  id: string;
  stage: DistributionOpportunityStage;
  nextActionAt: Date | null;
  unit: { id: string; label: string; property: { id: string; name: string } };
};
export type OverviewProspect = {
  id: string; name: string; email: string | null; phone: string | null;
  source: string | null; note: string | null; opportunities: OverviewOpportunity[];
};
export const nextActionFilters = {
  overdue: "Po termínu", today: "Dnes", week: "Příštích 7 dní", missing: "Bez termínu",
} as const;
export type ProspectFilters = {
  q: string; propertyId: string; unitId: string; stage: string; due: string; unassigned: boolean;
};
export function prospectFilters(query: Record<string, string | string[] | undefined>): ProspectFilters {
  const value = (key: string) => typeof query[key] === "string" ? query[key].trim() : "";
  return { q: value("q"), propertyId: value("propertyId"), unitId: value("unitId"), stage: value("stage"), due: value("due"), unassigned: value("unassigned") === "1" };
}

/** Stored date inputs are UTC calendar dates; “today” follows the Czech business day. */
export function crmToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function nextActionState(opportunity: Pick<OverviewOpportunity, "stage" | "nextActionAt">, today: string) {
  if (["WON", "LOST"].includes(opportunity.stage)) return "closed";
  if (!opportunity.nextActionAt) return "missing";
  const day = opportunity.nextActionAt.toISOString().slice(0, 10);
  return day < today ? "overdue" : day === today ? "today" : "future";
}
const normalize = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("cs-CZ");

/** All opportunity predicates must match the SAME opportunity, never different units of one contact. */
export function filterProspectOverview<T extends OverviewProspect>(prospects: T[], filters: ProspectFilters, today: string): T[] {
  const hasOpportunityFilter = Boolean(filters.propertyId || filters.unitId || filters.stage || filters.due);
  const weekEnd = new Date(`${today}T00:00:00Z`);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
  const weekEndDay = weekEnd.toISOString().slice(0, 10);
  return prospects.flatMap(prospect => {
    if (!normalize([prospect.name, prospect.email, prospect.phone, prospect.source, prospect.note].join(" ")).includes(normalize(filters.q))) return [];
    // “Unassigned” is based on the original eligible opportunities, before display filters.
    if (filters.unassigned && prospect.opportunities.length) return [];
    const opportunities = prospect.opportunities.filter(opportunity => {
      if (filters.propertyId && opportunity.unit.property.id !== filters.propertyId) return false;
      if (filters.unitId && opportunity.unit.id !== filters.unitId) return false;
      if (filters.stage && opportunity.stage !== filters.stage) return false;
      if (!filters.due) return true;
      const state = nextActionState(opportunity, today);
      if (filters.due === "week") return state === "future" && opportunity.nextActionAt!.toISOString().slice(0, 10) <= weekEndDay;
      return filters.due in nextActionFilters && state === filters.due;
    });
    if (hasOpportunityFilter && !opportunities.length) return [];
    return [{ ...prospect, opportunities }];
  });
}
