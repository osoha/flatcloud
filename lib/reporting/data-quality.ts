import { z } from "zod";
export const reportingQualityCodes = ["UNKNOWN_OPERATIONAL_HISTORY", "MISSING_UNIT_AREA", "RENT_SOURCE_LEGACY_FALLBACK", "MISSING_RENT_SOURCE", "MISSING_CHARGE_FOR_PERIOD", "DEPOSIT_CONFIGURATION_WARNING", "NO_RENTABLE_UNITS", "ACTIVE_LEASE_FUTURE_FINANCIAL_TRACKING"] as const;
export const reportingQualityIssueSchema = z.object({ code: z.enum(reportingQualityCodes), severity: z.enum(["INFO", "WARNING", "BLOCKER"]), message: z.string().min(1), propertyId: z.string().optional(), unitId: z.string().optional(), leaseId: z.string().optional() }).strict();
export const reportingQualitySchema = z.object({ issues: z.array(reportingQualityIssueSchema) }).strict();
export type ReportingQualityIssue = z.infer<typeof reportingQualityIssueSchema>;

export const reportingQualityCopy: Record<ReportingQualityIssue["code"], { label: string; description: string }> = {
  UNKNOWN_OPERATIONAL_HISTORY: { label: "Chybí historie provozního režimu", description: "K rozhodnému datu není známý provozní režim jednotky." },
  MISSING_UNIT_AREA: { label: "Chybí plocha jednotky", description: "Jednotka nemá vyplněnou použitelnou podlahovou plochu." },
  RENT_SOURCE_LEGACY_FALLBACK: { label: "Nájem nebo služby používají starší nastavení", description: "Částka byla převzata ze staršího nastavení smlouvy. Zkontrolujte pravidelné položky předpisu." },
  MISSING_RENT_SOURCE: { label: "Chybí zdroj nájemného", description: "Smlouva nemá pro rozhodné datum nastavenou použitelnou položku nájemného." },
  MISSING_CHARGE_FOR_PERIOD: { label: "Chybí předpis za období", description: "Aktivní smlouva nemá za rozhodný měsíc vytvořený předpis." },
  DEPOSIT_CONFIGURATION_WARNING: { label: "Kauce není nastavena", description: "U smlouvy nejsou evidované podmínky kauce." },
  NO_RENTABLE_UNITS: { label: "Nemovitost nemá pronajímatelné jednotky", description: "U nemovitosti není k rozhodnému datu známá žádná pronajímatelná jednotka." },
  ACTIVE_LEASE_FUTURE_FINANCIAL_TRACKING: { label: "Aktivní smlouva má finanční evidenci v budoucnu", description: "LIVE report dočasně používá smluvní částky. Plánovač posune finanční evidenci nejdříve na aktuální měsíc a znovu vytvoří pouze současné a budoucí předpisy." },
};

export type ReportingQualityTargetUser = { role: string; allProperties?: boolean; memberships?: Array<{ propertyId: string; permission?: string }>; unitMemberships?: Array<{ unitId: string; permission?: string; unit?: { propertyId: string } }>; reportingGroupMemberships?: Array<{ reportingGroupId: string; permission: string }> };
export type ReportingQualityIssueTarget = { href: string; actionLabel: "Opravit →" | "Zobrazit →"; canEdit: boolean } | null;

/** Resolves only Rent routes and Rent grants. Reporting-group membership is deliberately ignored. */
export function reportingQualityIssueTarget(issue: ReportingQualityIssue, user: ReportingQualityTargetUser): ReportingQualityIssueTarget {
  if (!issue.propertyId) return null;
  const allAccess = user.role === "SUPER_ADMIN" || user.role === "MANAGER" || Boolean(user.allProperties);
  const propertyGrant = user.memberships?.find((membership) => membership.propertyId === issue.propertyId);
  const unitGrant = issue.unitId ? user.unitMemberships?.find((membership) => membership.unitId === issue.unitId && (!membership.unit || membership.unit.propertyId === issue.propertyId)) : undefined;
  if (!allAccess && !propertyGrant && !unitGrant) return null;
  const canEdit = allAccess || [propertyGrant?.permission, unitGrant?.permission].some((permission) => permission === "EDIT" || permission === "ADMIN");
  const unitDetail = issue.unitId ? `/nemovitosti/${issue.propertyId}/jednotky/${issue.unitId}` : null;
  const leaseDetail = issue.leaseId ? `/smlouvy/${issue.leaseId}` : null;
  let href: string;
  if (issue.code === "MISSING_UNIT_AREA" || issue.code === "UNKNOWN_OPERATIONAL_HISTORY") href = canEdit && unitDetail ? `${unitDetail}/upravit` : unitDetail || `/nemovitosti/${issue.propertyId}/jednotky`;
  else if (issue.code === "ACTIVE_LEASE_FUTURE_FINANCIAL_TRACKING") href = canEdit && issue.leaseId ? `/nemovitosti/${issue.propertyId}/smlouvy/${issue.leaseId}/upravit` : leaseDetail || unitDetail || `/nemovitosti/${issue.propertyId}/smlouvy`;
  else if (["MISSING_RENT_SOURCE", "RENT_SOURCE_LEGACY_FALLBACK", "MISSING_CHARGE_FOR_PERIOD"].includes(issue.code)) href = canEdit && issue.leaseId ? `/nemovitosti/${issue.propertyId}/predpisy/${issue.leaseId}` : leaseDetail || unitDetail || `/nemovitosti/${issue.propertyId}/predpisy`;
  else if (issue.code === "DEPOSIT_CONFIGURATION_WARNING") href = leaseDetail ? `${leaseDetail}#kauce` : unitDetail || `/nemovitosti/${issue.propertyId}/jednotky`;
  else href = `/nemovitosti/${issue.propertyId}/jednotky`;
  return { href, actionLabel: canEdit ? "Opravit →" : "Zobrazit →", canEdit };
}

export function groupReportingQualityIssues(issues: ReportingQualityIssue[]) {
  const groups = new Map<ReportingQualityIssue["code"], ReportingQualityIssue[]>();
  for (const issue of issues) groups.set(issue.code, [...(groups.get(issue.code) || []), issue]);
  return [...groups.entries()].map(([code, occurrences]) => ({ code, ...reportingQualityCopy[code], occurrences }));
}
